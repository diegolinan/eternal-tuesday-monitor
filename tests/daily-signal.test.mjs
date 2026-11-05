import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  selectSignal,
  sha256,
  updateDailySignal,
  validateSignal,
} from '../scripts/update-daily-signal.mjs';

const quotes = [
  { _id: 'a', content: 'Mañana ≠ hoy.\n', author: 'Test author' },
  { _id: 'b', content: 'Another test phrase.', author: 'Test author' },
];
const now = new Date('2026-11-05T23:59:00Z');

test('SHA-256 hashes exact UTF-8 text and detects altered snapshots', () => {
  assert.equal(
    sha256('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  const signal = selectSignal([quotes[0]], '2026-11-05');
  assert.notEqual(signal.sha256, sha256(quotes[0].content.trim()));
  assert.equal(signal.quote.text, quotes[0].content);
  assert.throws(() => validateSignal({ ...signal, sha256: '0'.repeat(64) }));
  assert.throws(() => validateSignal({ ...signal, edition: '2026-02-30' }));
});

test('daily selection is reproducible and rejects malformed upstream data', () => {
  assert.deepEqual(
    selectSignal(quotes, '2026-11-05'),
    selectSignal(quotes, '2026-11-05'),
  );
  assert.throws(() => selectSignal([], '2026-11-05'));
  assert.throws(() =>
    selectSignal([{ _id: 'bad', content: '<html>' }], '2026-11-05'),
  );
});

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'etm-daily-signal-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, 'signal.json');
}

test('one daily snapshot is shared across reruns without fetching again', async (t) => {
  const file = await fixture(t);
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return { ok: true, json: async () => quotes };
  };
  const first = await updateDailySignal({ file, now, fetchImpl });
  const second = await updateDailySignal({ file, now, fetchImpl });
  assert.equal(calls, 1);
  assert.equal(first.status, 'updated');
  assert.equal(second.status, 'unchanged');
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), first.signal);
});

test('network and payload failures retain the previous bytes and edition', async (t) => {
  const file = await fixture(t);
  const bytes = JSON.stringify(selectSignal(quotes, '2026-11-04'));
  await writeFile(file, bytes);
  for (const fetchImpl of [
    async () => {
      throw new Error('Certificate expired');
    },
    async () => ({ ok: false, status: 503 }),
    async () => ({ ok: true, json: async () => ({ error: 'Unavailable' }) }),
  ]) {
    const result = await updateDailySignal({ file, now, fetchImpl });
    assert.equal(result.status, 'retained');
    assert.equal(result.signal.edition, '2026-11-04');
    assert.equal(await readFile(file, 'utf8'), bytes);
  }
});

test('UTC rollover updates the edition, and first-run failure cannot invent data', async (t) => {
  const file = await fixture(t);
  await assert.rejects(
    updateDailySignal({
      file,
      now,
      fetchImpl: async () => {
        throw new Error('Offline');
      },
    }),
  );
  await writeFile(file, JSON.stringify(selectSignal(quotes, '2026-11-05')));
  const result = await updateDailySignal({
    file,
    now: new Date('2026-11-06T00:00:00Z'),
    fetchImpl: async () => ({ ok: true, json: async () => quotes }),
  });
  assert.equal(result.status, 'updated');
  assert.equal(result.signal.edition, '2026-11-06');
});

test('the committed public snapshot has a verifiable complete SHA-256', async () => {
  validateSignal(
    JSON.parse(
      await readFile(
        new URL('../public/data/daily-signal.json', import.meta.url),
        'utf8',
      ),
    ),
  );
});
