import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const input = path.join(root, 'data/changelog/events.jsonl');
const output = path.join(root, 'public/data/changelog.json');
const events = (await readFile(input, 'utf8'))
  .split(/\r?\n/)
  .filter(Boolean)
  .map(JSON.parse)
  .sort((left, right) =>
    right.recorded_on.localeCompare(left.recorded_on) || right.id.localeCompare(left.id),
  );

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ schemaVersion: '1.0.0', events })}\n`);
console.log(`Compiled ${events.length} public Monitor changelog events.`);
