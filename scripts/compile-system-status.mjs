import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { compilePublicSystemStatus } from '../lib/system-status.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const outputPath = path.join(root, 'public/data/system-status.json');
const inputFlag = process.argv.indexOf('--input');

async function readRuns() {
  if (inputFlag >= 0) {
    const inputPath = process.argv[inputFlag + 1];
    if (!inputPath) throw new Error('--input requires a JSON file');
    const payload = JSON.parse(
      await readFile(path.resolve(root, inputPath), 'utf8'),
    );
    return payload.workflow_runs ?? payload;
  }

  const token = process.env.SYSTEM_STATUS_TOKEN;
  const repository = process.env.SYSTEM_STATUS_REPOSITORY;
  if (!token || !repository)
    throw new Error('Status source credentials are not configured');

  const apiOrigin =
    process.env.SYSTEM_STATUS_API_ORIGIN ?? 'https://api.github.com';
  const workflow = process.env.SYSTEM_STATUS_WORKFLOW ?? 'discover-models.yml';
  const response = await fetch(
    `${apiOrigin}/repos/${repository}/actions/workflows/${workflow}/runs?per_page=50`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'eternal-tuesday-monitor-status-compiler',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  if (!response.ok)
    throw new Error(`Status source returned HTTP ${response.status}`);
  const payload = await response.json();
  return payload.workflow_runs ?? [];
}

const status = compilePublicSystemStatus(await readRuns());
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
console.log('Compiled neutral public system status.');
