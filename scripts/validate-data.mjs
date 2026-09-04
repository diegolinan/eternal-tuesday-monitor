import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = fileURLToPath(new URL('..', import.meta.url));
const observationPath = 'data/observations/observations.jsonl';
const failures = [];

const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
const fail = (message) => failures.push(message);
const ids = (items) => new Set(items.map((item) => item.id));
const isId = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value);

function assertUnique(label, items) {
  const seen = new Set();
  for (const item of items) {
    if (!isId(item.id)) fail(`${label}: invalid id ${JSON.stringify(item.id)}`);
    if (seen.has(item.id)) fail(`${label}: duplicate id ${item.id}`);
    seen.add(item.id);
  }
}

function isDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
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
  if (typeof value === 'string' && isDay(observation.last_verified_on)) {
    const earliest =
      precision === 'year'
        ? `${value}-01-01`
        : precision === 'month'
          ? `${value}-01`
          : value;
    if (earliest > observation.last_verified_on)
      fail(`${observation.id}: observation date is after last_verified_on`);
  }
}

async function sha256(relativePath) {
  const bytes = await readFile(path.join(root, relativePath));
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
  release,
  contentManifest,
  sourceSchema,
  evidenceSchema,
  observationSchema,
  methodologySchema,
  releaseSchema,
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
  readJson('data/releases/2026-09-03.json'),
  readJson('content/manifest.json'),
  readJson('schemas/source.schema.json'),
  readJson('schemas/evidence.schema.json'),
  readJson('schemas/observation.schema.json'),
  readJson('schemas/methodology.schema.json'),
  readJson('schemas/release.schema.json'),
]);

const rawObservationLedger = await readFile(
  path.join(root, observationPath),
  'utf8',
);
const observationLines = rawObservationLedger
  .split(/\r?\n/)
  .filter((line) => line.trim());
const observations = observationLines.map((line, index) => {
  try {
    return JSON.parse(line);
  } catch (error) {
    fail(`${observationPath}:${index + 1}: invalid JSON (${error.message})`);
    return { id: `invalid-line-${index + 1}` };
  }
});

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});
addFormats(ajv);

function validateWithSchema(label, schema, items) {
  const validate = ajv.compile(schema);
  for (const item of items) {
    if (!validate(item)) {
      const details = (validate.errors ?? [])
        .map((error) => `${error.instancePath || '/'} ${error.message}`)
        .join('; ');
      fail(
        `${label} ${item?.id ?? '(unknown id)'}: JSON Schema validation failed: ${details}`,
      );
    }
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
validateWithSchema('release', releaseSchema, [release]);

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
const observationsById = new Map(
  observations.map((item, index) => [item.id, { item, index }]),
);
const productById = new Map(
  productsFile.products.map((item) => [item.id, item]),
);
const surfaceById = new Map(
  surfacesFile.surfaces.map((item) => [item.id, item]),
);
const modelById = new Map(modelsFile.models.map((item) => [item.id, item]));
const evidenceById = new Map(
  evidenceFile.evidence_records.map((item) => [item.id, item]),
);

for (const product of productsFile.products) {
  if (!vendors.has(product.vendor_id))
    fail(`${product.id}: unknown vendor_id ${product.vendor_id}`);
}

for (const surface of surfacesFile.surfaces) {
  if (!products.has(surface.product_id))
    fail(`${surface.id}: unknown product_id ${surface.product_id}`);
}

for (const model of modelsFile.models) {
  if (model.vendor_id !== null && !vendors.has(model.vendor_id))
    fail(`${model.id}: unknown vendor_id ${model.vendor_id}`);
  if (
    !['named', 'not_specified', 'aggregate', 'unknown'].includes(
      model.identity_status,
    )
  )
    fail(`${model.id}: invalid identity_status`);
}

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
  if (!(evidence.source_ids ?? []).includes('source-supplied-article'))
    fail(`${evidence.id}: initial evidence must include the supplied article`);
  if (!evidence.summary?.trim()) fail(`${evidence.id}: summary is required`);
  if (!Array.isArray(evidence.limitations) || evidence.limitations.length === 0)
    fail(`${evidence.id}: at least one limitation is required`);
}

const allowedObservationKeys = new Set([
  'schema_version',
  'id',
  'vendor_id',
  'product_id',
  'surface_id',
  'model_id',
  'probe_id',
  'result_status_id',
  'evidence_class_id',
  'observation_date',
  'last_verified_on',
  'evidence_record_ids',
  'methodology_version_id',
  'record_states',
  'supersedes_observation_id',
]);

for (const [index, observation] of observations.entries()) {
  const prefix = `${observationPath}:${index + 1}`;
  for (const key of Object.keys(observation))
    if (!allowedObservationKeys.has(key))
      fail(`${prefix}: unexpected field ${key}`);
  for (const key of allowedObservationKeys)
    if (!(key in observation)) fail(`${prefix}: missing field ${key}`);
  if (observation.schema_version !== '1.0.0')
    fail(`${observation.id}: unsupported schema_version`);
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
  if (!isDay(observation.last_verified_on))
    fail(`${observation.id}: invalid last_verified_on`);
  validateObservationDate(observation);

  const product = productById.get(observation.product_id);
  const surface = surfaceById.get(observation.surface_id);
  const model = modelById.get(observation.model_id);
  if (product && product.vendor_id !== observation.vendor_id)
    fail(`${observation.id}: product does not belong to vendor`);
  if (surface && surface.product_id !== observation.product_id)
    fail(`${observation.id}: surface does not belong to product`);
  if (model?.vendor_id && model.vendor_id !== observation.vendor_id)
    fail(`${observation.id}: model does not belong to vendor`);

  if (
    !Array.isArray(observation.evidence_record_ids) ||
    observation.evidence_record_ids.length === 0
  )
    fail(`${observation.id}: requires evidence_record_ids`);
  for (const evidenceId of observation.evidence_record_ids ?? []) {
    if (!evidenceRecords.has(evidenceId))
      fail(`${observation.id}: unknown evidence record ${evidenceId}`);
    if (
      evidenceById.get(evidenceId)?.evidence_class_id !==
      observation.evidence_class_id
    )
      fail(`${observation.id}: evidence class does not match ${evidenceId}`);
  }

  if (
    !Array.isArray(observation.record_states) ||
    observation.record_states.length === 0
  )
    fail(`${observation.id}: requires record_states`);
  for (const state of observation.record_states ?? [])
    if (!recordStates.has(state))
      fail(`${observation.id}: unknown record state ${state}`);
  if (
    observation.record_states?.includes('CURRENT') &&
    observation.record_states.includes('HISTORICAL')
  )
    fail(`${observation.id}: cannot be CURRENT and HISTORICAL`);
  if (observation.result_status_id === 'NO_PUBLIC_EVIDENCE') {
    if (
      observation.evidence_class_id !== 'evidence-untested-no-public-evidence'
    )
      fail(
        `${observation.id}: evidence-gap result requires evidence-gap class`,
      );
    if (!observation.record_states?.includes('UNTESTED'))
      fail(`${observation.id}: evidence-gap result requires UNTESTED state`);
  }

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

if (!methodologies.has(release.monitor_methodology_version_id))
  fail(`${release.id}: unknown monitor methodology`);
if (!sources.has(release.article_source_id))
  fail(`${release.id}: unknown article source`);
if (!isDay(release.data_cutoff)) fail(`${release.id}: invalid data_cutoff`);
const releaseObservationIds = new Set(release.observation_ids);
for (const id of release.observation_ids)
  if (!observationsById.has(id))
    fail(`${release.id}: unknown observation ${id}`);
for (const observation of observations) {
  if (!releaseObservationIds.has(observation.id))
    fail(
      `${release.id}: ledger observation omitted from release: ${observation.id}`,
    );
  if (observation.last_verified_on > release.data_cutoff)
    fail(`${observation.id}: last_verified_on exceeds release cutoff`);
}

for (const item of [contentManifest.article, ...contentManifest.assets]) {
  const actual = await sha256(item.path);
  if (actual !== item.sha256)
    fail(`${item.path}: sha256 does not match content manifest`);
}

const publicPairs = contentManifest.assets.map((item) => [
  item.path,
  `public/assets/${path.basename(item.path)}`,
]);
for (const [canonical, published] of publicPairs) {
  if ((await sha256(canonical)) !== (await sha256(published)))
    fail(`${published}: publication copy differs from ${canonical}`);
}

const baseArgIndex = process.argv.indexOf('--base');
if (baseArgIndex !== -1) {
  const base = process.argv[baseArgIndex + 1];
  if (!base) fail('--base requires a Git revision');
  else {
    const prior = spawnSync(
      'git',
      [
        '-c',
        `safe.directory=${root.replaceAll('\\', '/')}`,
        'show',
        `${base}:${observationPath}`,
      ],
      { cwd: root, encoding: 'utf8' },
    );
    if (prior.status === 0) {
      const priorLines = prior.stdout
        .split(/\r?\n/)
        .filter((line) => line.trim());
      if (priorLines.length > observationLines.length)
        fail('append-only violation: observation lines were deleted');
      priorLines.forEach((line, index) => {
        if (line !== observationLines[index])
          fail(
            `append-only violation: existing observation line ${index + 1} changed or moved`,
          );
      });
    } else if (
      !/does not exist in|exists on disk, but not in/.test(prior.stderr)
    ) {
      fail(
        `unable to compare append-only ledger with ${base}: ${prior.stderr.trim()}`,
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
  `Validated ${observations.length} observations, ${evidenceFile.evidence_records.length} evidence records, and ${sourcesFile.sources.length} sources for release ${release.id}.`,
);
