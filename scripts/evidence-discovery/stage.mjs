import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../..', import.meta.url));
const lines = async (file) =>
  (await readFile(path.join(root, file), 'utf8'))
    .split(/\r?\n/)
    .filter(Boolean);
const [existing, proposed] = await Promise.all([
  lines('data/evidence-discovery/candidates.jsonl'),
  lines('.evidence-discovery/candidates.jsonl'),
]);
const existingIds = new Set(existing.map((line) => JSON.parse(line).id));
const additions = proposed.filter(
  (line) => !existingIds.has(JSON.parse(line).id),
);
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
