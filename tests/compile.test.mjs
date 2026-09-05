import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

test('the public dataset compiles deterministically without rewriting results', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'etm-compile-'));
  const first = path.join(directory, 'first.json');
  const second = path.join(directory, 'second.json');
  for (const output of [first, second]) {
    const run = spawnSync(
      process.execPath,
      [
        'scripts/compile-monitor-view.mjs',
        '--as-of',
        '2026-09-07',
        '--output',
        output,
      ],
      { cwd: root, encoding: 'utf8' },
    );
    assert.equal(run.status, 0, run.stderr);
  }
  const firstText = await readFile(first, 'utf8');
  const secondText = await readFile(second, 'utf8');
  assert.equal(firstText, secondText);
  const data = JSON.parse(firstText);
  assert.equal(data.observations.length, 13);
  assert.equal(
    data.observations.filter((item) => item.applicability === 'CURRENT').length,
    10,
  );
  assert.equal(
    data.observations.filter((item) => item.applicability === 'HISTORICAL')
      .length,
    3,
  );
  assert.equal(
    data.observations.filter(
      (item) => item.currentSufficiency === 'RETEST_REQUIRED',
    ).length,
    3,
  );
  assert.ok(
    data.observations.every((item) => typeof item.observedResult === 'string'),
  );

  const futurePath = path.join(directory, 'future.json');
  const futureRun = spawnSync(
    process.execPath,
    [
      'scripts/compile-monitor-view.mjs',
      '--as-of',
      '2026-10-14',
      '--output',
      futurePath,
    ],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(futureRun.status, 0, futureRun.stderr);
  const future = JSON.parse(await readFile(futurePath, 'utf8'));
  assert.equal(
    future.observations.filter(
      (item) => item.currentSufficiency === 'RETEST_REQUIRED',
    ).length,
    9,
  );
  assert.deepEqual(
    future.observations.map(
      ({
        id,
        observedResult,
        observedOn,
        evidenceVerifiedOn,
        sourceCheckedOn,
        applicability,
      }) => ({
        id,
        observedResult,
        observedOn,
        evidenceVerifiedOn,
        sourceCheckedOn,
        applicability,
      }),
    ),
    data.observations.map(
      ({
        id,
        observedResult,
        observedOn,
        evidenceVerifiedOn,
        sourceCheckedOn,
        applicability,
      }) => ({
        id,
        observedResult,
        observedOn,
        evidenceVerifiedOn,
        sourceCheckedOn,
        applicability,
      }),
    ),
  );
});
