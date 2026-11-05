import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { dedupeCandidates, knownCandidateExclusions, normalizeUrl } from './core.mjs';
import { excludePendingCandidates } from './pending-proposals.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const lines = async (file) =>
  (await readFile(path.join(root, file), 'utf8'))
    .split(/\r?\n/)
    .filter(Boolean);
const [existing, proposed, decisions] = await Promise.all([
  lines('data/evidence-discovery/candidates.jsonl'),
  lines('.evidence-discovery/candidates.jsonl'),
  lines('data/evidence-discovery/decisions.jsonl'),
]);
let pending = { ids: [], urls: [] };
try {
  pending = JSON.parse(
    await readFile(
      path.join(root, '.evidence-discovery/pending-pr-candidates.json'),
      'utf8',
    ),
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (
  !pending ||
  !Array.isArray(pending.ids) ||
  pending.ids.some((id) => !/^evcand-[a-f0-9]{24}$/.test(id)) ||
  !Array.isArray(pending.urls) ||
  pending.urls.some((url) => typeof url !== 'string' || normalizeUrl(url) !== url)
)
  throw new Error('INVALID_PENDING_CANDIDATES');
const known = knownCandidateExclusions(existing.map(JSON.parse), decisions.map(JSON.parse));
const additions = dedupeCandidates(
  excludePendingCandidates(
    proposed.map((line) => ({ line, ...JSON.parse(line) })),
    known.ids,
    pending,
    known.urls,
  ),
).map((candidate) => candidate.line);
if (additions.length)
  await writeFile(
    path.join(root, 'data/evidence-discovery/candidates.jsonl'),
    [...existing, ...additions].join('\n') + '\n',
  );
await mkdir(path.join(root, '.evidence-discovery'), { recursive: true });
const body = additions.length
  ? `## Evidence candidates\n\nThe daily evidence watch found ${additions.length} new lead${additions.length === 1 ? '' : 's'}.\n\nThese records are **candidates only**. Merging preserves them for review; it does not create an observation, PASS, FAIL, product association, or accepted evidence.\n\nReview the source, exact model, product surface, probe relevance, date and evidentiary class before promoting anything into the canonical dataset.\n`
  : 'No new evidence candidates were found.\n';
await writeFile(path.join(root, '.evidence-discovery/pr-body.md'), body);
console.log(`Staged ${additions.length} new evidence candidates.`);
