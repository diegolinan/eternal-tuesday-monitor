import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  loadReleases,
  resolveReleaseAsOf,
} from './lib/release-resolution.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const input = path.join(root, 'data/changelog/events.jsonl');
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};
const asOf = option('--as-of') ?? new Date().toISOString().slice(0, 10);
const output = option('--output')
  ? path.resolve(root, option('--output'))
  : path.join(root, 'public/data/changelog.json');
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf))
  throw new Error('--as-of must be YYYY-MM-DD');
const release = resolveReleaseAsOf(await loadReleases(root), asOf).release;
const releasedObservationIds = new Set(release.observation_ids);
const events = (await readFile(input, 'utf8'))
  .split(/\r?\n/)
  .filter(Boolean)
  .map(JSON.parse)
  .filter((event) => event.recorded_on <= asOf)
  .filter((event) =>
    event.subjects
      .filter((subject) => subject.type === 'observation')
      .every((subject) => releasedObservationIds.has(subject.id)),
  )
  .map(({ pull_request_url: _internalReviewUrl, ...event }) => event)
  .sort(
    (left, right) =>
      right.recorded_on.localeCompare(left.recorded_on) ||
      right.id.localeCompare(left.id),
  );

await mkdir(path.dirname(output), { recursive: true });
await writeFile(
  output,
  `${JSON.stringify({ schemaVersion: '1.1.0', asOf, releaseId: release.id, events })}\n`,
);
console.log(
  `Compiled ${events.length} public Monitor changelog events through ${asOf} for ${release.id}.`,
);
