import { access, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { compileModelOperations } from '../lib/model-operations.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
};
const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.resolve(root, relativePath), 'utf8'));
const readLines = async (relativePath) => {
  try {
    return (await readFile(path.resolve(root, relativePath), 'utf8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .map(JSON.parse);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

async function resolveReportPath() {
  const requested = option('--report');
  const candidates = requested
    ? [
        path.join(requested, 'run.json'),
        path.join(requested, '.discovery/run.json'),
        requested,
      ]
    : ['.discovery/run.json'];
  for (const candidate of candidates) {
    try {
      await access(path.resolve(root, candidate));
      return candidate;
    } catch {
      // Try the next supported artifact layout.
    }
  }
  throw new Error(`Discovery report not found in ${candidates.join(', ')}`);
}

const reportPath = await resolveReportPath();
const [monitor, report, evaluationResults] = await Promise.all([
  readJson('public/data/monitor.json'),
  readJson(reportPath),
  readLines('data/model-evaluation/results.jsonl'),
]);
const completedAt = option('--completed-at');
if (completedAt && Number.isNaN(new Date(completedAt).valueOf()))
  throw new Error('--completed-at must be an ISO timestamp');

const result = compileModelOperations({
  monitorModels: monitor.models,
  report,
  evaluationResults,
  completedAt,
});
const outputPath = path.join(root, 'public/data/model-operations.json');
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(
  `Compiled operational status for ${result.models.length} models from ${reportPath}.`,
);
