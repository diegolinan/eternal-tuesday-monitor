import { access, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildPublicEvidenceStatus } from './public-status.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const option = (name) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? null : process.argv[i + 1];
};
const requested = option('--report') ?? '.evidence-discovery';
const candidates = [
  requested,
  path.join(requested, 'run.json'),
  path.join(requested, '.evidence-discovery/run.json'),
];
let reportPath = null;
for (const candidate of candidates)
  try {
    await access(path.resolve(root, candidate));
    if (candidate.endsWith('.json')) {
      reportPath = candidate;
      break;
    }
  } catch {}
if (!reportPath)
  throw new Error(`Evidence discovery report not found in ${requested}`);
const report = JSON.parse(
  await readFile(path.resolve(root, reportPath), 'utf8'),
);
const reviews = (
  await readFile(
    path.join(root, 'data/evidence-discovery/reviews.jsonl'),
    'utf8',
  )
)
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const publicStatus = buildPublicEvidenceStatus(report, reviews);
await writeFile(
  path.join(root, 'public/data/evidence-watch.json'),
  `${JSON.stringify(publicStatus, null, 2)}\n`,
);
console.log(
  `Compiled public evidence-watch status with ${publicStatus.candidateCounts.pending} pending and ${publicStatus.candidateCounts.reviewed} reviewed candidates.`,
);
