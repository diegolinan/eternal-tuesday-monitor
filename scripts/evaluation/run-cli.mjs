import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runEvaluation } from './runner.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
if (!process.env.OPENAI_API_KEY && !process.env.GITHUB_ACTIONS) {
  try {
    const env = await readFile(path.join(root, '.env.local'), 'utf8');
    const match = env.match(/^OPENAI_API_KEY=(.+)$/m);
    if (match) process.env.OPENAI_API_KEY = match[1].trim();
  } catch {}
}
const result = await runEvaluation({ root });
console.log(JSON.stringify(result, null, 2));
if (result.status === 'EXECUTION_BLOCKED_COST_POLICY') console.log('EXECUTION BLOCKED - COST POLICY');

