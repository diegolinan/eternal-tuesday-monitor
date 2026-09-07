import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildCandidate, dedupeCandidates } from './core.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const bidiAndZeroWidth = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu;
const clean = (value, max = 2000) =>
  String(value ?? '')
    .normalize('NFC')
    .replace(bidiAndZeroWidth, '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
const markdown = (value) =>
  clean(value).replace(/([\\`*_{}[\]()<>#+.!|~-])/g, '\\$1');
const readJson = async (file) =>
  JSON.parse(await readFile(path.join(root, file), 'utf8'));

const payload = JSON.parse(process.env.SUBMISSION_JSON ?? 'null');
if (!payload || typeof payload !== 'object' || Array.isArray(payload))
  throw new Error('INVALID_SUBMISSION');
if (JSON.stringify(payload).length > 14000)
  throw new Error('SUBMISSION_TOO_LARGE');

const requiredStrings = [
  'formSchemaVersion',
  'requestId',
  'receiptId',
  'intakeState',
  'catalogSchemaVersion',
  'submissionType',
  'vendorMode',
  'vendor',
  'modelMode',
  'model',
  'productSurface',
  'probeId',
  'observedOn',
  'summary',
  'relationship',
  'receivedAt',
];
for (const field of requiredStrings)
  if (typeof payload[field] !== 'string' || !clean(payload[field]))
    throw new Error(`INVALID_${field.toUpperCase()}`);
if (payload.formSchemaVersion !== '2.1.0')
  throw new Error('INVALID_FORM_VERSION');
if (payload.intakeState !== 'NEEDS_REVIEW')
  throw new Error('INVALID_INTAKE_STATE');
if (
  !/^ETM-LEAD-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/.test(payload.receiptId)
)
  throw new Error('INVALID_RECEIPT');
if (!/^[0-9a-f-]{36}$/i.test(payload.requestId))
  throw new Error('INVALID_REQUEST_ID');
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
if (
  clean(payload.summary, 1801).length < 30 ||
  clean(payload.summary, 1801).length > 1800
)
  throw new Error('INVALID_SUMMARY');
if (payload.submissionType === 'FIRSTHAND_OBSERVATION') {
  if (clean(payload.expectedBehavior, 1201).length < 15)
    throw new Error('INVALID_EXPECTED_BEHAVIOR');
  if (clean(payload.actualBehavior, 1201).length < 15)
    throw new Error('INVALID_ACTUAL_BEHAVIOR');
  if (clean(payload.reproductionSteps, 1801).length < 20)
    throw new Error('INVALID_REPRODUCTION_STEPS');
}
if (
  payload.submissionType === 'FOUND_SOURCE' &&
  (typeof payload.sourceUrl !== 'string' || !clean(payload.sourceUrl))
)
  throw new Error('INVALID_SOURCE_URL');
if (
  typeof payload.submissionFingerprint !== 'string' ||
  !/^[a-f0-9]{64}$/.test(payload.submissionFingerprint)
)
  throw new Error('INVALID_SUBMISSION_FINGERPRINT');

const [vendors, models, products, surfaces] = await Promise.all([
  readJson('data/catalog/vendors.json'),
  readJson('data/catalog/models.json'),
  readJson('data/catalog/products.json'),
  readJson('data/catalog/surfaces.json'),
]);
if (payload.catalogSchemaVersion !== models.schema_version)
  throw new Error('STALE_CATALOG_VERSION');

let vendorIds = [];
if (payload.vendorMode === 'CATALOG') {
  const vendor = vendors.vendors.find((item) => item.id === payload.vendorId);
  if (!vendor || vendor.name !== payload.vendor)
    throw new Error('INVALID_VENDOR_IDENTITY');
  vendorIds = [vendor.id];
} else if (payload.vendorMode === 'OTHER') {
  if (payload.vendorId !== '') throw new Error('INVALID_VENDOR_IDENTITY');
} else {
  throw new Error('INVALID_VENDOR_MODE');
}

let modelIds = [];
if (payload.modelMode === 'CATALOG') {
  const model = models.models.find((item) => item.id === payload.modelId);
  if (
    !model ||
    model.name !== payload.model ||
    model.vendor_id !== payload.vendorId
  )
    throw new Error('INVALID_MODEL_IDENTITY');
  modelIds = [model.id];
} else if (payload.modelMode === 'OTHER') {
  if (payload.modelId !== '') throw new Error('INVALID_MODEL_IDENTITY');
} else if (payload.modelMode === 'NOT_SPECIFIED') {
  if (payload.modelId !== '' || payload.model !== 'Exact model not known')
    throw new Error('INVALID_MODEL_IDENTITY');
} else {
  throw new Error('INVALID_MODEL_MODE');
}

const corpus =
  `${payload.vendor} ${payload.model} ${payload.productSurface}`.toLowerCase();
const includes = (value) => corpus.includes(String(value).toLowerCase());
const productIds = products.products
  .filter((item) => includes(item.name))
  .map((item) => item.id);
const surfaceIds = surfaces.surfaces
  .filter((item) => includes(item.name))
  .map((item) => item.id);
const probeIds = payload.probeId === 'UNSURE' ? [] : [payload.probeId];
const excerpt = [
  clean(payload.summary, 1800),
  clean(payload.expectedBehavior, 1200),
  clean(payload.actualBehavior, 1200),
  clean(payload.reproductionSteps, 1800),
]
  .filter(Boolean)
  .join(' ');
const candidate = buildCandidate({
  sourceType: 'PUBLIC_SUBMISSION',
  sourceUrl: payload.sourceUrl,
  identityKey: payload.submissionFingerprint,
  submissionFingerprint: payload.submissionFingerprint,
  title: `Community lead: ${clean(payload.vendor, 80)} / ${clean(payload.model, 120)}`,
  excerpt,
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
        name: clean(payload.publicName, 100) || null,
        affiliation: clean(payload.affiliation, 120) || null,
      }
    : null,
});
if (!candidate) throw new Error('CANDIDATE_NOT_CREATED');

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
    `${[...existing, ...additions].map((item) => JSON.stringify(item)).join('\n')}\n`,
  );

const checklist = additions.length
  ? `## Community evidence lead

- **Receipt:** \`${markdown(payload.receiptId)}\`
- **Intake state:** **NEEDS REVIEW**
- **Source:** ${candidate.source_url ?? 'No public source supplied — firsthand observation only'}
- **Submitted as:** ${markdown(payload.submissionType)}
- **Vendor:** ${markdown(payload.vendor)} (${markdown(payload.vendorMode)})
- **Model:** ${markdown(payload.model)} (${markdown(payload.modelMode)})
- **Suggested Monitor question:** ${candidate.probe_ids.length ? candidate.probe_ids.map(markdown).join(', ') : 'not established'}
- **Relationship disclosed:** ${markdown(payload.relationship)}
- **Public attribution consent:** ${payload.attributionConsent ? 'yes' : 'no'}

This is an unverified lead. It cannot create a PASS, FAIL, product association or accepted observation.

### Reviewer checklist

- [ ] If a public source was supplied, it is accessible and actually supports the submitted summary.
- [ ] If no public source was supplied, the report remains a firsthand lead until independently reproduced.
- [ ] The date is supported by the source or observation record.
- [ ] Vendor, exact model and product surface are verified; unknowns remain explicit.
- [ ] The suggested Monitor question fits the claim.
- [ ] The source class and relationship disclosure are accurate.
- [ ] The lead is not already represented by an accepted or pending record.
- [ ] The candidate states what the source shows and what it does **not** prove.
- [ ] Any promotion uses the normal evidence methodology; this lead alone does not establish behavioral evidence.
`
  : `## Duplicate community evidence lead

**Receipt:** \`${markdown(payload.receiptId)}\`

The normalized source and screening-policy identity are already present in the candidate ledger. No duplicate record was added.
`;
await writeFile(path.join(root, '.submission-pr-body.md'), checklist);
console.log(`Staged ${additions.length} public evidence candidate.`);
