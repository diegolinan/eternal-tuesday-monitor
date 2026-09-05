import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertReleaseChain,
  loadReleases,
  resolveCurrentRelease,
  resolveReleaseAsOf,
} from '../scripts/lib/release-resolution.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('the current release is resolved from versioned manifests', async () => {
  const entries = await loadReleases(root);
  assert.equal(resolveCurrentRelease(entries).release.id, 'release-2026-09-08');
  assert.deepEqual(assertReleaseChain(entries), []);
});

test('the current release includes the reviewed Codex pilot observation', async () => {
  const entries = await loadReleases(root);
  const release = resolveCurrentRelease(entries).release;
  assert.equal(release.published_on, '2026-09-08');
  assert.equal(release.data_cutoff, '2026-09-05');
  assert.equal(release.observation_ids.length, 14);
});

test('future-dated releases remain stored but are not published early', async () => {
  const entries = await loadReleases(root);
  assert.equal(
    resolveReleaseAsOf(entries, '2026-09-05').release.id,
    'release-2026-09-03',
  );
  assert.equal(
    resolveReleaseAsOf(entries, '2026-09-07').release.id,
    'release-2026-09-07',
  );
  assert.equal(
    resolveReleaseAsOf(entries, '2026-09-08').release.id,
    'release-2026-09-08',
  );
});

test('the September 3 release remains an unchanged provenance manifest', async () => {
  const entries = await loadReleases(root);
  const original = entries.find(
    ({ release }) => release.id === 'release-2026-09-03',
  ).release;
  assert.equal(original.schema_version, '1.0.0');
  assert.equal(original.data_cutoff, '2026-09-03');
  assert.equal(original.observation_ids.length, 13);
  assert.equal('published_on' in original, false);
  assert.equal('supersedes_release_id' in original, false);
  assert.equal('freshness_policy_id' in original, false);
});
