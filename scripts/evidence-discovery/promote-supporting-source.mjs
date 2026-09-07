import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { activeCandidateReviews } from './review.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
const readLines = async (relativePath) =>
  (await readFile(path.join(root, relativePath), 'utf8'))
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse);
const required = (name, max = 300) => {
  const value = String(process.env[name] ?? '').trim();
  if (!value || value.length > max) throw new Error(`INVALID_${name}`);
  return value;
};
const markdown = (value) =>
  String(value ?? '').replace(/([\\`*_{}[\]()<>#+.!|~-])/g, '\\$1');

const candidateId = required('CANDIDATE_ID', 80);
const reviewId = required('REVIEW_ID', 80);
const evidenceId = required('EVIDENCE_ID', 120);
const sourceId = required('SOURCE_ID', 120);
const publisher = required('SOURCE_PUBLISHER', 200);
const sourceType = required('SOURCE_TYPE', 80);
const verifiedOn = required('VERIFIED_ON', 10);
const notes = required('SOURCE_NOTES', 1200);
if (!/^[a-z0-9][a-z0-9-]*$/.test(sourceId))
  throw new Error('INVALID_SOURCE_ID');
if (!/^\d{4}-\d{2}-\d{2}$/.test(verifiedOn))
  throw new Error('INVALID_VERIFIED_ON');
if (notes.length < 20) throw new Error('INVALID_SOURCE_NOTES');

const [
  candidates,
  reviews,
  sourcesFile,
  evidenceFile,
  observations,
  changelog,
] = await Promise.all([
  readLines('data/evidence-discovery/candidates.jsonl'),
  readLines('data/evidence-discovery/reviews.jsonl'),
  readJson('data/sources/sources.json'),
  readJson('data/evidence/evidence.json'),
  readLines('data/observations/observations.jsonl'),
  readLines('data/changelog/events.jsonl'),
]);
const candidate = candidates.find((item) => item.id === candidateId);
if (!candidate) throw new Error('UNKNOWN_CANDIDATE');
if (!candidate.source_url) throw new Error('CANDIDATE_HAS_NO_PUBLIC_SOURCE');
const activeReview = activeCandidateReviews(reviews, candidate.id);
if (
  activeReview.length !== 1 ||
  activeReview[0].id !== reviewId ||
  activeReview[0].decision !== 'ACCEPTED_AS_SUPPORTING_SOURCE'
)
  throw new Error('ACTIVE_ACCEPTANCE_REQUIRED');

const evidence = evidenceFile.evidence_records.find(
  (item) => item.id === evidenceId,
);
if (!evidence) throw new Error('UNKNOWN_EVIDENCE_RECORD');
const linkedObservations = observations.filter((item) =>
  item.evidence_record_ids.includes(evidence.id),
);
if (!linkedObservations.length) throw new Error('EVIDENCE_HAS_NO_OBSERVATION');
const coordinateMatches = (candidateIds, field) =>
  !candidateIds.length ||
  linkedObservations.some((item) => candidateIds.includes(item[field]));
if (
  !coordinateMatches(candidate.vendor_ids, 'vendor_id') ||
  !coordinateMatches(candidate.model_ids, 'model_id') ||
  !coordinateMatches(candidate.product_ids, 'product_id') ||
  !coordinateMatches(candidate.surface_ids, 'surface_id') ||
  !coordinateMatches(candidate.probe_ids, 'probe_id')
)
  throw new Error('CANDIDATE_DOES_NOT_MATCH_EVIDENCE_COORDINATE');

const sourceByUrl = sourcesFile.sources.find(
  (item) => item.url === candidate.source_url,
);
if (sourceByUrl && sourceByUrl.id !== sourceId)
  throw new Error(`SOURCE_URL_ALREADY_EXISTS_AS:${sourceByUrl.id}`);
const sourceById = sourcesFile.sources.find((item) => item.id === sourceId);
if (sourceById && sourceById.url !== candidate.source_url)
  throw new Error('SOURCE_ID_ALREADY_EXISTS');
if (evidence.source_ids.includes(sourceId))
  throw new Error('SOURCE_ALREADY_SUPPORTS_EVIDENCE');

if (!sourceById)
  sourcesFile.sources.push({
    id: sourceId,
    title: candidate.source_title,
    publisher,
    source_type: sourceType,
    url: candidate.source_url,
    last_verified_on: verifiedOn,
    notes: `${notes} Candidate ${candidate.id}; acceptance ${reviewId}.`,
  });
evidence.source_ids.push(sourceId);

const changeIdentity = JSON.stringify([
  candidate.id,
  reviewId,
  evidence.id,
  sourceId,
  verifiedOn,
]);
const changeId = `change-${verifiedOn}-${createHash('sha256').update(changeIdentity).digest('hex').slice(0, 12)}`;
if (changelog.some((item) => item.id === changeId))
  throw new Error('PROMOTION_ALREADY_RECORDED');
changelog.push({
  schema_version: '1.0.0',
  id: changeId,
  recorded_on: verifiedOn,
  type: 'EVIDENCE_ADDED',
  title: 'Supporting source added after human review',
  summary: `A reviewed candidate source was added to ${evidence.id}. No observation result or applicability state was changed.`,
  source: 'HUMAN_REVIEW',
  subjects: [{ type: 'source', id: sourceId, label: candidate.source_title }],
  source_urls: [candidate.source_url],
  pull_request_url: null,
  affects_observations: false,
});

await Promise.all([
  writeFile(
    path.join(root, 'data/sources/sources.json'),
    `${JSON.stringify(sourcesFile, null, 2)}\n`,
  ),
  writeFile(
    path.join(root, 'data/evidence/evidence.json'),
    `${JSON.stringify(evidenceFile, null, 2)}\n`,
  ),
  writeFile(
    path.join(root, 'data/changelog/events.jsonl'),
    `${changelog.map((item) => JSON.stringify(item)).join('\n')}\n`,
  ),
]);

await writeFile(
  path.join(root, '.evidence-promotion-pr-body.md'),
  `## Promote one accepted supporting source

- **Candidate:** \`${markdown(candidate.id)}\`
- **Acceptance:** \`${markdown(reviewId)}\`
- **Source:** \`${markdown(sourceId)}\` — ${candidate.source_url}
- **Existing evidence:** \`${markdown(evidence.id)}\`
- **Affected observations:** ${linkedObservations.map((item) => `\`${markdown(item.id)}\``).join(', ')}

This proposal adds a supporting source to an existing evidence record. It does not create an observation, alter a result, or establish PASS or FAIL.

### Merge check

- [ ] The active candidate decision is **ACCEPTED AS SUPPORTING SOURCE**.
- [ ] The source supports this exact evidence coordinate and summary.
- [ ] Publisher, source class, verification date and limitations are accurate.
- [ ] The public changelog correctly says that no observation result changed.
`,
);
console.log(`Prepared supporting source ${sourceId} for ${evidence.id}.`);
