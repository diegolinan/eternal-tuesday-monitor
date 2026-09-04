import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadReleases(root) {
  const directory = path.join(root, 'data/releases');
  const names = (await readdir(directory))
    .filter((name) => name.endsWith('.json'))
    .sort();
  return Promise.all(
    names.map(async (name) => ({
      file: `data/releases/${name}`,
      release: JSON.parse(await readFile(path.join(directory, name), 'utf8')),
    })),
  );
}

export function releaseDate(release) {
  return release.published_on ?? release.data_cutoff;
}

export function resolveCurrentRelease(entries) {
  if (entries.length === 0) throw new Error('No release manifests found');
  return [...entries].sort((left, right) => {
    const dateOrder = releaseDate(right.release).localeCompare(
      releaseDate(left.release),
    );
    return dateOrder || right.release.id.localeCompare(left.release.id);
  })[0];
}

export function assertReleaseChain(entries) {
  const byId = new Map(entries.map((entry) => [entry.release.id, entry]));
  const successors = new Map();
  const failures = [];

  for (const { release, file } of entries) {
    if (!release.supersedes_release_id) continue;
    if (!byId.has(release.supersedes_release_id)) {
      failures.push(
        `${file}: unknown supersedes_release_id ${release.supersedes_release_id}`,
      );
      continue;
    }
    if (successors.has(release.supersedes_release_id)) {
      failures.push(
        `${file}: ${release.supersedes_release_id} already has successor ${successors.get(release.supersedes_release_id)}`,
      );
    }
    successors.set(release.supersedes_release_id, release.id);
    if (
      releaseDate(release) <=
      releaseDate(byId.get(release.supersedes_release_id).release)
    ) {
      failures.push(`${file}: release date must follow the superseded release`);
    }
  }

  return failures;
}
