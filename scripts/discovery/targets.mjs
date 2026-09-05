import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { latestModels, eligibility } from './lifecycle.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url));
const i = process.argv.indexOf('--as-of');
const asOf =
  i < 0 ? new Date().toISOString().slice(0, 10) : process.argv[i + 1];
if (
  !/^\d{4}-\d{2}-\d{2}$/.test(asOf ?? '') ||
  new Date(`${asOf}T00:00:00Z`).toISOString().slice(0, 10) !== asOf
)
  throw new Error('Invalid --as-of');
const events = (
  await readFile(path.join(root, 'data/model-discovery/events.jsonl'), 'utf8')
)
  .split(/\r?\n/)
  .filter(Boolean)
  .map(JSON.parse);
const policy = JSON.parse(
  await readFile(path.join(root, 'config/probe-execution-policy.json'), 'utf8'),
);
const models = latestModels(events.filter((e) => e.recorded_on <= asOf));
const targets = models.flatMap((m) => eligibility(m, policy, asOf).targets);
await mkdir(path.join(root, '.discovery'), { recursive: true });
await writeFile(
  path.join(root, '.discovery/probe-targets.json'),
  JSON.stringify(
    { evaluated_on: asOf, execution_enabled: false, targets },
    null,
    2,
  ) + '\n',
);
console.log(
  `${targets.length} eligible API targets; execution remains disabled.`,
);
