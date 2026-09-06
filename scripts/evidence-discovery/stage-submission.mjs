import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildCandidate, dedupeCandidates } from './core.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const payload = JSON.parse(process.env.SUBMISSION_JSON ?? 'null');
if (!payload || typeof payload !== 'object' || Array.isArray(payload))
  throw new Error('INVALID_SUBMISSION');
const required = [
  'submissionType',
  'vendor',
  'model',
  'productSurface',
  'probeId',
  'sourceUrl',
  'observedOn',
  'summary',
  'relationship',
  'receivedAt',
];
for (const field of required)
  if (typeof payload[field] !== 'string' || !payload[field].trim())
    throw new Error(`INVALID_${field.toUpperCase()}`);
if (!['FOUND_SOURCE', 'FIRSTHAND_OBSERVATION'].includes(payload.submissionType))
  throw new Error('INVALID_SUBMISSION_TYPE');
if (
  !['NONE', 'USER', 'AUTHOR', 'EMPLOYEE', 'OTHER'].includes(
    payload.relationship,
  )
)
  throw new Error('INVALID_RELATIONSHIP');
if (typeof payload.attributionConsent !== 'boolean')
  throw new Error('INVALID_CONSENT');
if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.observedOn))
  throw new Error('INVALID_DATE');
if (Number.isNaN(new Date(payload.receivedAt).valueOf()))
  throw new Error('INVALID_RECEIVED_AT');
if (payload.summary.length < 30 || payload.summary.length > 1800)
  throw new Error('INVALID_SUMMARY');
for (const [field, max] of [
  ['vendor', 80],
  ['model', 120],
  ['productSurface', 160],
])
  if (payload[field].length > max || /[\r\n]/.test(payload[field]))
    throw new Error(`INVALID_${field.toUpperCase()}`);
if (JSON.stringify(payload).length > 10000)
  throw new Error('SUBMISSION_TOO_LARGE');

const readJson = async (file) =>
  JSON.parse(await readFile(path.join(root, file), 'utf8'));
const [vendors, models, products, surfaces] = await Promise.all([
  readJson('data/catalog/vendors.json'),
  readJson('data/catalog/models.json'),
  readJson('data/catalog/products.json'),
  readJson('data/catalog/surfaces.json'),
]);
const corpus =
  `${payload.vendor} ${payload.model} ${payload.productSurface}`.toLowerCase();
const includes = (value) => corpus.includes(String(value).toLowerCase());
const vendorIds = vendors.vendors
  .filter((item) => includes(item.name))
  .map((item) => item.id);
const modelIds = models.models
  .filter((item) => includes(item.api_model_id ?? item.name))
  .map((item) => item.id);
const productIds = products.products
  .filter((item) => includes(item.name))
  .map((item) => item.id);
const surfaceIds = surfaces.surfaces
  .filter((item) => includes(item.name))
  .map((item) => item.id);
const probeIds = payload.probeId === 'UNSURE' ? [] : [payload.probeId];
const candidate = buildCandidate({
  sourceType: 'PUBLIC_SUBMISSION',
  sourceUrl: payload.sourceUrl,
  title: `Community lead: ${payload.vendor} / ${payload.model}`,
  excerpt: `${payload.summary} ${payload.expectedBehavior ?? ''} ${payload.actualBehavior ?? ''}`,
  publishedOn: payload.observedOn,
  discoveredAt: payload.receivedAt,
  probeIds,
  vendorIds,
  modelIds,
  productIds,
  surfaceIds,
  queryId: 'public-intake',
  allowUnclassified: true,
  publicAttribution: payload.attributionConsent
    ? {
        name: payload.publicName || null,
        affiliation: payload.affiliation || null,
      }
    : null,
});
const ledgerPath = path.join(root, 'data/evidence-discovery/candidates.jsonl');
const raw = await readFile(ledgerPath, 'utf8');
const existing = raw.split(/\r?\n/).filter(Boolean).map(JSON.parse);
const additions = dedupeCandidates(
  [candidate],
  new Set(existing.map((item) => item.id)),
);
if (additions.length)
  await writeFile(
    ledgerPath,
    [...existing, ...additions].map((item) => JSON.stringify(item)).join('\n') +
      '\n',
  );
const summary = additions.length
  ? `## Community evidence lead\n\nA public submission produced one review candidate. It is a lead only and cannot create a PASS, FAIL, product association, or accepted observation.\n\n- Source: ${candidate.source_url}\n- Suggested probe: ${candidate.probe_ids.length ? candidate.probe_ids.join(', ') : 'not established'}\n- Relationship disclosed: ${payload.relationship}\n- Public attribution consent: ${payload.attributionConsent ? 'yes' : 'no'}\n\nVerify the source, exact model, surface, date and evidence class before promotion.\n`
  : 'This submitted source is already present in the candidate ledger.\n';
await writeFile(path.join(root, '.submission-pr-body.md'), summary);
console.log(`Staged ${additions.length} public evidence candidate.`);
