import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { validateDiscovery } from './discovery/validate.mjs';
import {
  assertReleaseChain,
  loadReleases,
  releaseDate,
  resolveCurrentRelease,
} from './lib/release-resolution.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const observationPath = 'data/observations/observations.jsonl';
const eventPath = 'data/state-events/events.jsonl';
const evaluationResultPath = 'data/model-evaluation/results.jsonl';
const sourceCheckPath = 'data/model-discovery/source-checks.jsonl';
const failures = [];
failures.push(...(await validateDiscovery(root)));
const fail = (message) => failures.push(message);
const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
const ids = (items) => new Set(items.map((item) => item.id));
const isId = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value);
const isDay = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};
const readJsonLines = async (relativePath) => {
  const raw = await readFile(path.join(root, relativePath), 'utf8');
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  return {
    lines,
    items: lines.map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        fail(`${relativePath}:${index + 1}: invalid JSON (${error.message})`);
        return { id: `invalid-line-${index + 1}` };
      }
    }),
  };
};
const readOptionalJsonLines = async (relativePath) => {
  try { return await readJsonLines(relativePath); }
  catch (error) { if (error.code === 'ENOENT') return { lines: [], items: [] }; throw error; }
};

function assertUnique(label, items) {
  const seen = new Set();
  for (const item of items) {
    if (!isId(item.id)) fail(`${label}: invalid id ${JSON.stringify(item.id)}`);
    if (seen.has(item.id)) fail(`${label}: duplicate id ${item.id}`);
    seen.add(item.id);
  }
}

function validateObservationDate(observation) {
  const { value, precision } = observation.observation_date ?? {};
  const valid =
    precision === 'day'
      ? isDay(value)
      : precision === 'month'
        ? /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
        : precision === 'year'
          ? /^\d{4}$/.test(value)
          : false;
  if (!valid)
    fail(`${observation.id}: observation_date does not match its precision`);
  const earliest =
    precision === 'year'
      ? `${value}-01-01`
      : precision === 'month'
        ? `${value}-01`
        : value;
  if (
    typeof value === 'string' &&
    isDay(observation.last_verified_on) &&
    earliest > observation.last_verified_on
  )
    fail(`${observation.id}: observation date is after last_verified_on`);
}

async function sha256(relativePath) {
  let bytes = await readFile(path.join(root, relativePath));
  if (relativePath.endsWith('.md'))
    bytes = Buffer.from(
      bytes.toString('utf8').replaceAll('\r\n', '\n'),
      'utf8',
    );
  return createHash('sha256').update(bytes).digest('hex');
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
  contentManifest,
  freshnessPolicy,
  evaluationPolicy,
  adoptionRegister,
  monitorView,
  sourceSchema,
  evidenceSchema,
  observationSchema,
  methodologySchema,
  releaseSchema,
  freshnessPolicySchema,
  evaluationPolicySchema,
  adoptionSchema,
  modelCatalogSchema,
  modelLifecycleSchema,
  stateEventSchema,
  evaluationResultSchema,
  sourceCheckSchema,
  releaseEntries,
  observationLedger,
  eventLedger,
  evaluationResultLedger,
  sourceCheckLedger,
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
  readJson('content/manifest.json'),
  readJson('config/freshness-policy.json'),
  readJson('config/model-evaluation-policy.json'),
  readJson('data/model-evaluation/adoption.json'),
  readJson('public/data/monitor.json'),
  readJson('schemas/source.schema.json'),
  readJson('schemas/evidence.schema.json'),
  readJson('schemas/observation.schema.json'),
  readJson('schemas/methodology.schema.json'),
  readJson('schemas/release.schema.json'),
  readJson('schemas/freshness-policy.schema.json'),
  readJson('schemas/model-evaluation-policy.schema.json'),
  readJson('schemas/model-evaluation-adoption.schema.json'),
  readJson('schemas/model-catalog.schema.json'),
  readJson('schemas/model-lifecycle.schema.json'),
  readJson('schemas/state-event.schema.json'),
  readJson('schemas/model-evaluation-result.schema.json'),
  readJson('schemas/source-check.schema.json'),
  loadReleases(root),
  readJsonLines(observationPath),
  readJsonLines(eventPath),
  readOptionalJsonLines(evaluationResultPath),
  readOptionalJsonLines(sourceCheckPath),
]);

const observations = observationLedger.items;
const stateEvents = eventLedger.items;
const evaluationResults = evaluationResultLedger.items;
const sourceChecks = sourceCheckLedger.items;
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});
addFormats(ajv);
function validateWithSchema(label, schema, items) {
  const validate = ajv.compile(schema);
  for (const item of items)
    if (!validate(item)) {
      const details = (validate.errors ?? [])
        .map((error) => `${error.instancePath || '/'} ${error.message}`)
        .join('; ');
      fail(
        `${label} ${item?.id ?? '(unknown id)'}: JSON Schema validation failed: ${details}`,
      );
    }
}

validateWithSchema('source', sourceSchema, sourcesFile.sources);
validateWithSchema('evidence', evidenceSchema, evidenceFile.evidence_records);
validateWithSchema('observation', observationSchema, observations);
validateWithSchema(
  'methodology',
  methodologySchema,
  methodologiesFile.methodologies,
);
validateWithSchema(
  'release',
  releaseSchema,
  releaseEntries.map(({ release }) => release),
);
validateWithSchema('freshness policy', freshnessPolicySchema, [
  freshnessPolicy,
]);
validateWithSchema('model evaluation policy', evaluationPolicySchema, [
  evaluationPolicy,
]);
validateWithSchema('model evaluation adoption', adoptionSchema, [
  adoptionRegister,
]);
validateWithSchema('model catalog', modelCatalogSchema, [modelsFile]);
validateWithSchema(
  'public model lifecycle',
  modelLifecycleSchema,
  monitorView.models,
);
validateWithSchema('state event', stateEventSchema, stateEvents);
validateWithSchema('model evaluation result', evaluationResultSchema, evaluationResults);
validateWithSchema('public source check', sourceCheckSchema, sourceChecks);

const collections = [
  ['vendors', vendorsFile.vendors],
  ['products', productsFile.products],
  ['surfaces', surfacesFile.surfaces],
  ['models', modelsFile.models],
  ['probes', probesFile.probes],
  ['evidence classes', evidenceClassesFile.evidence_classes],
  ['result statuses', statusesFile.result_statuses],
  ['record states', statusesFile.record_states],
  ['methodologies', methodologiesFile.methodologies],
  ['sources', sourcesFile.sources],
  ['evidence records', evidenceFile.evidence_records],
  ['observations', observations],
  ['state events', stateEvents],
  ['model evaluation results', evaluationResults],
  ['public source checks', sourceChecks],
  ['releases', releaseEntries.map(({ release }) => release)],
];
for (const [label, items] of collections) {
  if (!Array.isArray(items)) fail(`${label}: expected an array`);
  else assertUnique(label, items);
}

const vendors = ids(vendorsFile.vendors);
const products = ids(productsFile.products);
const surfaces = ids(surfacesFile.surfaces);
const models = ids(modelsFile.models);
const probes = ids(probesFile.probes);
const evidenceClasses = ids(evidenceClassesFile.evidence_classes);
const resultStatuses = ids(statusesFile.result_statuses);
const recordStates = ids(statusesFile.record_states);
const methodologies = ids(methodologiesFile.methodologies);
const sources = ids(sourcesFile.sources);
const evidenceRecords = ids(evidenceFile.evidence_records);
const releases = ids(releaseEntries.map(({ release }) => release));
const observationsById = new Map(
  observations.map((item, index) => [item.id, { item, index }]),
);
const productsById = new Map(
  productsFile.products.map((item) => [item.id, item]),
);
const surfacesById = new Map(
  surfacesFile.surfaces.map((item) => [item.id, item]),
);
const modelsById = new Map(modelsFile.models.map((item) => [item.id, item]));
const evidenceById = new Map(
  evidenceFile.evidence_records.map((item) => [item.id, item]),
);

if (evaluationPolicy.surface_id && !surfaces.has(evaluationPolicy.surface_id))
  fail(
    `${evaluationPolicy.policy_id}: unknown surface ${evaluationPolicy.surface_id}`,
  );
const configuredProviders = new Set();
for (const providerId of evaluationPolicy.providers) {
  if (!vendors.has(providerId))
    fail(`${evaluationPolicy.policy_id}: unknown provider ${providerId}`);
  if (configuredProviders.has(providerId))
    fail(`${evaluationPolicy.policy_id}: duplicate provider ${providerId}`);
  configuredProviders.add(providerId);
}
const configuredProbeProfiles = new Set();
for (const profile of evaluationPolicy.probe_profiles) {
  if (!probes.has(profile.probe_id))
    fail(`${evaluationPolicy.policy_id}: unknown probe ${profile.probe_id}`);
  if (configuredProbeProfiles.has(profile.probe_id))
    fail(
      `${evaluationPolicy.policy_id}: duplicate probe profile ${profile.probe_id}`,
    );
  configuredProbeProfiles.add(profile.probe_id);
}
for (const probeId of probes)
  if (!configuredProbeProfiles.has(probeId))
    fail(`${evaluationPolicy.policy_id}: missing probe profile ${probeId}`);
const adoptionModels = new Set();
for (const record of adoptionRegister.records) {
  if (!models.has(record.model_id))
    fail(`adoption: unknown model ${record.model_id}`);
  if (!vendors.has(record.vendor_id))
    fail(`adoption: unknown vendor ${record.vendor_id}`);
  if (adoptionModels.has(record.model_id))
    fail(`adoption: duplicate model ${record.model_id}`);
  adoptionModels.add(record.model_id);
  if (
    modelsById.get(record.model_id)?.vendor_id &&
    modelsById.get(record.model_id).vendor_id !== record.vendor_id
  )
    fail(`adoption: ${record.model_id} vendor mismatch`);
  for (const probe of record.probes) {
    if (!probes.has(probe.probe_id))
      fail(`adoption: unknown probe ${probe.probe_id}`);
    if (
      probe.methodology_version_id &&
      !methodologies.has(probe.methodology_version_id)
    )
      fail(`adoption: unknown methodology ${probe.methodology_version_id}`);
  }
}
for (const result of evaluationResults) {
  if (!models.has(result.model_id)) fail(`model evaluation result: unknown model ${result.model_id}`);
  if (!vendors.has(result.vendor_id)) fail(`model evaluation result: unknown vendor ${result.vendor_id}`);
  if (!surfaces.has(result.surface_id)) fail(`model evaluation result: unknown surface ${result.surface_id}`);
  if (!probes.has(result.probe_id)) fail(`model evaluation result: unknown probe ${result.probe_id}`);
  if (!methodologies.has(result.methodology_version_id)) fail(`model evaluation result: unknown methodology ${result.methodology_version_id}`);
  if (!evidenceClasses.has(result.evidence_class_id)) fail(`model evaluation result: unknown evidence class ${result.evidence_class_id}`);
}

for (const product of productsFile.products)
  if (!vendors.has(product.vendor_id))
    fail(`${product.id}: unknown vendor_id ${product.vendor_id}`);
for (const surface of surfacesFile.surfaces)
  if (!products.has(surface.product_id))
    fail(`${surface.id}: unknown product_id ${surface.product_id}`);
for (const model of modelsFile.models)
  if (model.vendor_id !== null && !vendors.has(model.vendor_id))
    fail(`${model.id}: unknown vendor_id ${model.vendor_id}`);
for (const source of sourcesFile.sources) {
  if (!isDay(source.last_verified_on))
    fail(`${source.id}: invalid last_verified_on`);
  if (!source.url && !source.repository_path)
    fail(`${source.id}: requires url or repository_path`);
  if (source.url && !source.url.startsWith('https://'))
    fail(`${source.id}: source URL must use https`);
  if (source.sha256 && !/^[a-f0-9]{64}$/.test(source.sha256))
    fail(`${source.id}: invalid sha256`);
}
for (const evidence of evidenceFile.evidence_records) {
  if (!evidenceClasses.has(evidence.evidence_class_id))
    fail(`${evidence.id}: unknown evidence_class_id`);
  if (!Array.isArray(evidence.source_ids) || evidence.source_ids.length === 0)
    fail(`${evidence.id}: requires source_ids`);
  for (const sourceId of evidence.source_ids ?? [])
    if (!sources.has(sourceId))
      fail(`${evidence.id}: unknown source_id ${sourceId}`);
  if (!evidence.summary?.trim()) fail(`${evidence.id}: summary is required`);
  if (!Array.isArray(evidence.limitations) || evidence.limitations.length === 0)
    fail(`${evidence.id}: at least one limitation is required`);
}

for (const [index, observation] of observations.entries()) {
  if (!vendors.has(observation.vendor_id))
    fail(`${observation.id}: unknown vendor_id`);
  if (!products.has(observation.product_id))
    fail(`${observation.id}: unknown product_id`);
  if (!surfaces.has(observation.surface_id))
    fail(`${observation.id}: unknown surface_id`);
  if (!models.has(observation.model_id))
    fail(`${observation.id}: unknown model_id`);
  if (!probes.has(observation.probe_id))
    fail(`${observation.id}: unknown probe_id`);
  if (!resultStatuses.has(observation.result_status_id))
    fail(`${observation.id}: unknown result_status_id`);
  if (!evidenceClasses.has(observation.evidence_class_id))
    fail(`${observation.id}: unknown evidence_class_id`);
  if (!methodologies.has(observation.methodology_version_id))
    fail(`${observation.id}: unknown methodology_version_id`);
  if (
    observation.last_verified_on !== null &&
    !isDay(observation.last_verified_on)
  )
    fail(`${observation.id}: invalid last_verified_on`);
  validateObservationDate(observation);
  if (
    productsById.get(observation.product_id)?.vendor_id !==
    observation.vendor_id
  )
    fail(`${observation.id}: product does not belong to vendor`);
  if (
    surfacesById.get(observation.surface_id)?.product_id !==
    observation.product_id
  )
    fail(`${observation.id}: surface does not belong to product`);
  if (
    modelsById.get(observation.model_id)?.vendor_id &&
    modelsById.get(observation.model_id).vendor_id !== observation.vendor_id
  )
    fail(`${observation.id}: model does not belong to vendor`);
  for (const evidenceId of observation.evidence_record_ids ?? []) {
    if (!evidenceRecords.has(evidenceId))
      fail(`${observation.id}: unknown evidence record ${evidenceId}`);
    if (
      evidenceById.get(evidenceId)?.evidence_class_id !==
      observation.evidence_class_id
    )
      fail(`${observation.id}: evidence class does not match ${evidenceId}`);
  }
  for (const state of observation.record_states ?? [])
    if (!recordStates.has(state))
      fail(`${observation.id}: unknown record state ${state}`);
  if (
    observation.record_states?.includes('CURRENT') &&
    observation.record_states.includes('HISTORICAL')
  )
    fail(`${observation.id}: cannot be CURRENT and HISTORICAL`);
  if (
    observation.result_status_id === 'NO_PUBLIC_EVIDENCE' &&
    !observation.record_states?.includes('UNTESTED')
  )
    fail(`${observation.id}: evidence-gap result requires UNTESTED state`);
  if (observation.supersedes_observation_id !== null) {
    const previous = observationsById.get(
      observation.supersedes_observation_id,
    );
    if (!previous)
      fail(`${observation.id}: superseded observation does not exist`);
    else if (previous.index >= index)
      fail(
        `${observation.id}: superseded observation must appear earlier in the ledger`,
      );
  }
}

const policyClasses = new Set();
for (const rule of freshnessPolicy.rules) {
  if (!evidenceClasses.has(rule.evidence_class_id))
    fail(
      `${freshnessPolicy.id}: unknown evidence class ${rule.evidence_class_id}`,
    );
  if (policyClasses.has(rule.evidence_class_id))
    fail(`${freshnessPolicy.id}: duplicate rule for ${rule.evidence_class_id}`);
  policyClasses.add(rule.evidence_class_id);
}
for (const evidenceClass of evidenceClasses)
  if (!policyClasses.has(evidenceClass))
    fail(`${freshnessPolicy.id}: missing rule for ${evidenceClass}`);

const eventSubjects = {
  observation: new Set(observationsById.keys()),
  model: models,
  surface: surfaces,
  methodology: methodologies,
  source: sources,
};
const eventSubjectTypes = {
  RETEST_REQUIRED: ['observation'],
  CURRENT_SUFFICIENCY_RESTORED: ['observation'],
  SUPERSEDED: ['model'],
  SURFACE_DISCONTINUED: ['surface'],
  METHODOLOGY_SUPERSEDED: ['methodology'],
  SOURCE_UNAVAILABLE: ['source'],
  SOURCE_AVAILABLE: ['source'],
};
for (const event of stateEvents) {
  if (!eventSubjects[event.subject_type]?.has(event.subject_id))
    fail(`${event.id}: unknown ${event.subject_type} ${event.subject_id}`);
  if (event.recorded_on < event.effective_on)
    fail(`${event.id}: recorded_on is before effective_on`);
  if (!eventSubjectTypes[event.event_type]?.includes(event.subject_type))
    fail(
      `${event.id}: ${event.event_type} cannot target ${event.subject_type}`,
    );
}

for (const message of assertReleaseChain(releaseEntries)) fail(message);
for (const { release, file } of releaseEntries) {
  if (!methodologies.has(release.monitor_methodology_version_id))
    fail(`${file}: unknown monitor methodology`);
  if (!sources.has(release.article_source_id))
    fail(`${file}: unknown article source`);
  if (
    release.freshness_policy_id &&
    release.freshness_policy_id !== freshnessPolicy.id
  )
    fail(`${file}: unknown freshness policy ${release.freshness_policy_id}`);
  if (
    release.supersedes_release_id &&
    !releases.has(release.supersedes_release_id)
  )
    fail(`${file}: unknown superseded release`);
  if (release.published_on && release.published_on < release.data_cutoff)
    fail(`${file}: published_on precedes data_cutoff`);
  for (const id of release.observation_ids) {
    const observation = observationsById.get(id)?.item;
    if (!observation) fail(`${file}: unknown observation ${id}`);
    else if (observation.last_verified_on > release.data_cutoff)
      fail(`${file}: ${id} last_verified_on exceeds release cutoff`);
  }
}
const currentEntry = resolveCurrentRelease(releaseEntries);
const currentIds = new Set(currentEntry.release.observation_ids);
for (const observation of observations)
  if (!currentIds.has(observation.id))
    fail(
      `${currentEntry.file}: ledger observation omitted from current release: ${observation.id}`,
    );

for (const item of [contentManifest.article, ...contentManifest.assets]) {
  const actual = await sha256(item.path);
  if (actual !== item.sha256)
    fail(
      `${path.join(root, item.path)}: sha256 ${actual} does not match content manifest ${item.sha256}`,
    );
}
for (const item of contentManifest.assets) {
  const published = `public/assets/${path.basename(item.path)}`;
  if ((await sha256(item.path)) !== (await sha256(published)))
    fail(`${published}: publication copy differs from ${item.path}`);
}

function git(args) {
  return spawnSync(
    'git',
    ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args],
    { cwd: root, encoding: 'utf8' },
  );
}
function compareAppendOnlyLines(base, relativePath, currentLines) {
  const prior = git(['show', `${base}:${relativePath}`]);
  if (prior.status !== 0) {
    if (!/does not exist in|exists on disk, but not in/.test(prior.stderr))
      fail(
        `unable to compare ${relativePath} with ${base}: ${prior.stderr.trim()}`,
      );
    return;
  }
  const priorLines = prior.stdout.split(/\r?\n/).filter((line) => line.trim());
  if (priorLines.length > currentLines.length)
    fail(`append-only violation: lines deleted from ${relativePath}`);
  priorLines.forEach((line, index) => {
    if (line !== currentLines[index])
      fail(
        `append-only violation: ${relativePath} line ${index + 1} changed or moved`,
      );
  });
}

const baseArgIndex = process.argv.indexOf('--base');
if (baseArgIndex !== -1) {
  const base = process.argv[baseArgIndex + 1];
  if (!base) fail('--base requires a Git revision');
  else {
    compareAppendOnlyLines(base, observationPath, observationLedger.lines);
    compareAppendOnlyLines(base, eventPath, eventLedger.lines);
    compareAppendOnlyLines(base, evaluationResultPath, evaluationResultLedger.lines);
    compareAppendOnlyLines(base, sourceCheckPath, sourceCheckLedger.lines);
    compareAppendOnlyLines(
      base,
      'data/model-discovery/events.jsonl',
      (
        await readFile(
          path.join(root, 'data/model-discovery/events.jsonl'),
          'utf8',
        )
      )
        .split(/\r?\n/)
        .filter(Boolean),
    );
    const priorReleaseList = git([
      'ls-tree',
      '-r',
      '--name-only',
      base,
      '--',
      'data/releases',
    ]);
    if (priorReleaseList.status !== 0)
      fail(
        `unable to list releases at ${base}: ${priorReleaseList.stderr.trim()}`,
      );
    else
      for (const releaseFile of priorReleaseList.stdout
        .split(/\r?\n/)
        .filter(Boolean)) {
        const prior = git(['show', `${base}:${releaseFile}`]);
        let current;
        try {
          current = await readFile(path.join(root, releaseFile), 'utf8');
        } catch {
          current = null;
        }
        if (current === null)
          fail(`append-only violation: release deleted: ${releaseFile}`);
        else if (
          prior.stdout.replaceAll('\r\n', '\n') !==
          current.replaceAll('\r\n', '\n')
        )
          fail(
            `append-only violation: existing release changed: ${releaseFile}`,
          );
      }
  }
}

if (failures.length) {
  console.error(`Data validation failed with ${failures.length} issue(s):`);
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}
console.log(
  `Validated ${observations.length} observations, ${evidenceFile.evidence_records.length} evidence records, ${sourcesFile.sources.length} sources, ${stateEvents.length} state events, and ${releaseEntries.length} releases. Current release: ${currentEntry.release.id} (${releaseDate(currentEntry.release)}).`,
);
