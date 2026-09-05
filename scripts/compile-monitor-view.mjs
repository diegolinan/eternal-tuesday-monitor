import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { evaluateObservationFreshness } from './lib/freshness.mjs';
import { projectModels } from './discovery/project.mjs';
import {
  loadReleases,
  releaseDate,
  resolveCurrentRelease,
} from './lib/release-resolution.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
const indexById = (items) => new Map(items.map((item) => [item.id, item]));
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};
const asOfOption = option('--as-of');
const outputOption = option('--output');
if (asOfOption && !/^\d{4}-\d{2}-\d{2}$/.test(asOfOption)) {
  throw new Error('--as-of must be YYYY-MM-DD');
}

const [
  vendorsFile,
  productsFile,
  surfacesFile,
  modelsFile,
  probesFile,
  evidenceClassesFile,
  statusesFile,
  methodologiesFile,
  sourcesFile,
  evidenceFile,
  freshnessPolicy,
  evaluationPolicy,
  adoptionRegister,
  releaseEntries,
] = await Promise.all([
  readJson('data/catalog/vendors.json'),
  readJson('data/catalog/products.json'),
  readJson('data/catalog/surfaces.json'),
  readJson('data/catalog/models.json'),
  readJson('data/catalog/probes.json'),
  readJson('data/catalog/evidence-classes.json'),
  readJson('data/catalog/statuses.json'),
  readJson('data/methodologies/methodologies.json'),
  readJson('data/sources/sources.json'),
  readJson('data/evidence/evidence.json'),
  readJson('config/freshness-policy.json'),
  readJson('config/model-evaluation-policy.json'),
  readJson('data/model-evaluation/adoption.json'),
  loadReleases(root),
]);
const release = resolveCurrentRelease(releaseEntries).release;
const asOf = asOfOption ?? releaseDate(release);
if (asOf < releaseDate(release))
  throw new Error(
    `--as-of ${asOf} precedes current release ${releaseDate(release)}`,
  );

const parseLines = async (relativePath) =>
  (await readFile(path.join(root, relativePath), 'utf8'))
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
const [observations, stateEvents] = await Promise.all([
  parseLines('data/observations/observations.jsonl'),
  parseLines('data/state-events/events.jsonl'),
]);
let evaluationResults = [];
try {
  evaluationResults = await parseLines('data/model-evaluation/results.jsonl');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const vendors = indexById(vendorsFile.vendors);
const products = indexById(productsFile.products);
const surfaces = indexById(surfacesFile.surfaces);
const models = indexById(modelsFile.models);
const probes = indexById(probesFile.probes);
const evidenceClasses = indexById(evidenceClassesFile.evidence_classes);
const resultStatuses = indexById(statusesFile.result_statuses);
const methodologies = indexById(methodologiesFile.methodologies);
const sources = indexById(sourcesFile.sources);
const evidence = indexById(evidenceFile.evidence_records);
const monthNames = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];
function displayObservationDate({ value, precision }) {
  if (precision === 'year') return value;
  if (precision === 'month')
    return `${monthNames[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;
  return displayDay(value);
}
function displayDay(value) {
  return `${value.slice(8, 10)} ${monthNames[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;
}

const selected = new Set(release.observation_ids);
const siteObservations = observations
  .filter((item) => selected.has(item.id))
  .map((item) => {
    const evidenceRecords = item.evidence_record_ids.map((id) =>
      evidence.get(id),
    );
    const evidenceRecord = evidenceRecords[0];
    const sourceIds = [
      ...new Set(evidenceRecords.flatMap((record) => record.source_ids)),
    ];
    const evidenceSources = sourceIds.map((id) => sources.get(id));
    const externalSource = evidenceSources.find((source) => source.url);
    const evaluation = evaluateObservationFreshness({
      observation: item,
      evidenceRecord,
      sourceIds,
      policy: freshnessPolicy,
      events: stateEvents,
      asOf,
      observations: observations.filter((record) => selected.has(record.id)),
    });
    const sourceCheckedOn = externalSource?.last_verified_on ?? null;
    return {
      id: item.id,
      vendor: vendors.get(item.vendor_id).name,
      product: products.get(item.product_id).name,
      surface: surfaces.get(item.surface_id).name,
      model: models.get(item.model_id).name,
      probe: probes.get(item.probe_id).name,
      observedResult: resultStatuses.get(item.result_status_id).name,
      evidenceClass: evidenceClasses.get(item.evidence_class_id).name,
      observedOn: {
        value: item.observation_date.value,
        precision: item.observation_date.precision,
        label: displayObservationDate(item.observation_date),
      },
      evidenceVerifiedOn: item.last_verified_on,
      sourceCheckedOn,
      sourceUrl: externalSource?.url ?? null,
      evidenceNote: evidenceRecords
        .flatMap((record) => [record.summary, ...record.limitations])
        .join(' '),
      observationQualifiers: item.record_states.filter((state) =>
        ['INCONCLUSIVE', 'UNTESTED'].includes(state),
      ),
      applicability: evaluation.applicability,
      currentSufficiency: evaluation.currentSufficiency,
      sufficiencyReasons: evaluation.sufficiencyReasons,
      sourceAvailability: evaluation.sourceAvailability,
      evidenceAgeDays: evaluation.ageDays,
      maxEvidenceAgeDays: evaluation.maxAgeDays,
      stateHistory: evaluation.stateHistory.map((event) => ({
        id: event.id,
        type: event.event_type,
        effectiveOn: event.effective_on,
        reason: event.reason,
      })),
      methodologyVersion: methodologies.get(item.methodology_version_id)
        .version,
    };
  });

const view = {
  schemaVersion: '2.0',
  monitorName: release.monitor_name,
  releaseId: release.id,
  dataCutoff: release.data_cutoff,
  publishedOn: release.published_on ?? release.data_cutoff,
  freshnessEvaluatedOn: asOf,
  freshnessPolicyVersion: freshnessPolicy.id,
  modelEvaluationPolicyVersion: evaluationPolicy.policy_id,
  methodologyVersion: methodologies.get(release.monitor_methodology_version_id)
    .version,
  observations: siteObservations,
  models: projectModels(
    await parseLines('data/model-discovery/events.jsonl'),
    observations.filter((item) => selected.has(item.id)),
    await readJson('config/probe-execution-policy.json'),
    vendors,
    asOf,
    {
      catalog: modelsFile.models,
      probes: probesFile.probes,
      surfaces,
      products,
      projectedObservations: siteObservations,
      evaluationPolicy,
      adoptionRecords: new Map(
        adoptionRegister.records.map((record) => [record.model_id, record]),
      ),
      evaluationResults,
    },
  ),
};

const outputPath = outputOption
  ? path.resolve(root, outputOption)
  : path.join(root, 'public/data/monitor.json');
await writeFile(outputPath, `${JSON.stringify(view, null, 2)}\n`, 'utf8');
console.log(
  `Compiled ${siteObservations.length} observations for ${asOf} to ${path.relative(root, outputPath)}.`,
);
