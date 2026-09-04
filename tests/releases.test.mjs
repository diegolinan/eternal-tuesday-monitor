import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertReleaseChain,
  loadReleases,
  resolveCurrentRelease,
} from '../scripts/lib/release-resolution.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('the current release is resolved from versioned manifests', async () => {
  const entries = await loadReleases(root);
  assert.equal(resolveCurrentRelease(entries).release.id, 'release-2026-09-07');
  assert.deepEqual(assertReleaseChain(entries), []);
});

test('the launch release preserves the evidence cutoff and all observations', async () => {
  const entries = await loadReleases(root);
  const release = resolveCurrentRelease(entries).release;
  assert.equal(release.published_on, '2026-09-07');
  assert.equal(release.data_cutoff, '2026-09-03');
  assert.equal(release.observation_ids.length, 13);
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
