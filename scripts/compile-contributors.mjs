import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const registry = JSON.parse(
  await readFile(
    path.join(root, 'data/contributors/contributors.json'),
    'utf8',
  ),
);
const contributions = (
  await readFile(
    path.join(root, 'data/contributors/contributions.jsonl'),
    'utf8',
  )
)
  .split(/\r?\n/)
  .filter(Boolean)
  .map(JSON.parse)
  .filter((item) => item.public)
  .sort(
    (left, right) =>
      right.occurred_on.localeCompare(left.occurred_on) ||
      right.id.localeCompare(left.id),
  );

const publicContributors = registry.contributors.filter(
  (item) => item.public_attribution !== 'ANONYMOUS',
);
const output = {
  schemaVersion: '1.0.0',
  people: publicContributors.filter((item) => item.kind === 'PERSON'),
  automatedSystems: publicContributors.filter(
    (item) => item.kind === 'AUTOMATED_SYSTEM',
  ),
  contributions,
};

const outputPath = path.join(root, 'public/data/contributors.json');
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(
  `Compiled ${output.people.length} people, ${output.automatedSystems.length} automated systems and ${contributions.length} public contributions.`,
);
