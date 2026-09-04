import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
const indexById = (items) => new Map(items.map((item) => [item.id, item]));

const [vendorsFile, productsFile, surfacesFile, modelsFile, probesFile, evidenceClassesFile, statusesFile, methodologiesFile, sourcesFile, evidenceFile, release] = await Promise.all([
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
  readJson('data/releases/2026-09-03.json'),
]);

const observationLines = (await readFile(path.join(root, 'data/observations/observations.jsonl'), 'utf8'))
  .split(/\r?\n/)
  .filter((line) => line.trim());
const observations = observationLines.map((line) => JSON.parse(line));

const vendors = indexById(vendorsFile.vendors);
const products = indexById(productsFile.products);
const surfaces = indexById(surfacesFile.surfaces);
const models = indexById(modelsFile.models);
const probes = indexById(probesFile.probes);
const evidenceClasses = indexById(evidenceClassesFile.evidence_classes);
const resultStatuses = indexById(statusesFile.result_statuses);
const recordStates = indexById(statusesFile.record_states);
const methodologies = indexById(methodologiesFile.methodologies);
const sources = indexById(sourcesFile.sources);
const evidence = indexById(evidenceFile.evidence_records);

const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function displayObservationDate({ value, precision }) {
  if (precision === 'year') return value;
  if (precision === 'month') return `${monthNames[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;
  return `${value.slice(8, 10)} ${monthNames[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;
}
function displayDay(value) {
  return `${value.slice(8, 10)} ${monthNames[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;
}

const selected = new Set(release.observation_ids);
const siteObservations = observations.filter((item) => selected.has(item.id)).map((item) => {
  const evidenceRecord = evidence.get(item.evidence_record_ids[0]);
  const externalSource = evidenceRecord.source_ids.map((id) => sources.get(id)).find((source) => source.url);
  return {
    id: item.id,
    vendor: vendors.get(item.vendor_id).name,
    product: products.get(item.product_id).name,
    surface: surfaces.get(item.surface_id).name,
    model: models.get(item.model_id).name,
    probe: probes.get(item.probe_id).name,
    resultStatus: resultStatuses.get(item.result_status_id).name,
    evidenceClass: evidenceClasses.get(item.evidence_class_id).name,
    observedDate: displayObservationDate(item.observation_date),
    lastVerified: displayDay(item.last_verified_on),
    sourceUrl: externalSource.url,
    evidenceNote: [evidenceRecord.summary, ...evidenceRecord.limitations].join(' '),
    recordState: item.record_states.map((state) => recordStates.get(state).name),
    methodologyVersion: methodologies.get(item.methodology_version_id).version,
  };
});

const view = {
  schemaVersion: '1.0',
  monitorName: release.monitor_name,
  dataCutoff: release.data_cutoff,
  methodologyVersion: methodologies.get(release.monitor_methodology_version_id).version,
  articlePath: release.article_public_path,
  observations: siteObservations,
};

const outputPath = path.join(root, 'public/data/monitor.json');
await writeFile(outputPath, `${JSON.stringify(view, null, 2)}\n`, 'utf8');
console.log(`Compiled ${siteObservations.length} observations to public/data/monitor.json.`);
