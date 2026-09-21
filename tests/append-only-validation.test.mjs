import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceChecks = path.join(
  root,
  'data/model-discovery/source-checks.jsonl',
);

test('append-only validation reads ledgers larger than the spawnSync default buffer', () => {
  assert.ok(
    statSync(sourceChecks).size > 1024 * 1024,
    'fixture ledger must remain larger than Node spawnSync default maxBuffer',
  );

  const result = spawnSync(
    process.execPath,
    ['scripts/validate-data.mjs', '--base', 'HEAD'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr].filter(Boolean).join('\n'),
  );
});
