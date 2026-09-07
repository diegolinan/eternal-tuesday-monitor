import { access, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
const publicStatus = {
  schemaVersion: '1.0.0',
  generatedAt: report.generated_at,
  lastSearchAt: report.generated_at,
  state: report.state,
  channels: report.channels,
  candidateCounts: {
    pending: report.candidates.length,
    officialClaims: report.candidates.filter(
      (c) => c.claim_class === 'OFFICIAL_CAPABILITY_CLAIM',
    ).length,
    publicReports: report.candidates.filter((c) =>
      c.claim_class.startsWith('PUBLIC_'),
    ).length,
    researchResults: report.candidates.filter(
      (c) => c.claim_class === 'RESEARCH_RESULT',
    ).length,
  },
  // Unreviewed third-party titles are intentionally not republished. The
  // public surface exposes only aggregate lead counts until human review.
  latestCandidates: [],
};
await writeFile(
  path.join(root, 'public/data/evidence-watch.json'),
  `${JSON.stringify(publicStatus, null, 2)}\n`,
);
console.log(
  `Compiled public evidence-watch status with ${publicStatus.candidateCounts.pending} pending candidates.`,
);
