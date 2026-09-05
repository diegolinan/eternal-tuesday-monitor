import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  expectedAnswer,
  makeCases,
  makeRequest,
  protocol,
  reservationUsd,
  score,
  usageCost,
} from '../scripts/probes/protocol.mjs';
import {
  checkApproval,
  implementationHash,
  runPilot,
  verifyCandidate,
  exchangeRequest,
  safeError,
  apiError,
} from '../scripts/probes/pilot.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const now = () => '2026-09-05T00:01:00.000Z';
const key = 'fixture-only-secret-not-a-real-key';
const approval = async (changes = {}) => ({
  id: 'offline-test',
  protocol: protocol.id,
  implementationSha256: await implementationHash(root),
  budgetUsd: 1,
  issuedAt: '2026-09-05T00:00:00.000Z',
  expiresAt: '2026-09-06T00:00:00.000Z',
  ...changes,
});
const complete = (answer) => ({
  id: 'resp_fixture',
  model: 'gpt-5.4-mini-2026-03-17',
  status: 'completed',
  output: [
    {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: JSON.stringify(answer) }],
    },
  ],
  usage: { input_tokens: 100, output_tokens: 30, total_tokens: 130 },
});
const cases = makeCases(now());
test('credit exhaustion and insufficient_quota type are billing errors, not retryable rate limits', () => {
  for (const error of [
    { type: 'insufficient_quota', code: 'credit_balance_exhausted' },
    { type: 'insufficient_quota', code: null },
    { code: 'credit_balance_exhausted' },
  ])
    assert.equal(
      apiError({ httpStatus: 429, raw: JSON.stringify({ error }) }),
      'API_INSUFFICIENT_QUOTA',
    );
});
test('HTTP 429 billing inactivity is not a transient rate limit', () => {
  assert.equal(
    apiError({
      httpStatus: 429,
      raw: JSON.stringify({ error: { code: 'billing_not_active' } }),
    }),
    'API_BILLING_NOT_ACTIVE',
  );
  assert.equal(
    apiError({
      httpStatus: 429,
      raw: JSON.stringify({ error: { code: 'rate_limit_exceeded' } }),
    }),
    'API_RATE_LIMIT',
  );
  assert.equal(apiError({ httpStatus: 400, raw: '{}' }), 'API_INVALID_REQUEST');
});
const fakeFetch = async (url, options) => {
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.Authorization, `Bearer ${key}`);
  if (options.method === 'GET')
    return new Response(JSON.stringify({ id: protocol.model }));
  const request = JSON.parse(options.body);
  const testCase = cases.find(
    (item) => makeRequest(item).input === request.input,
  );
  assert.ok(testCase);
  assert.deepEqual(request, makeRequest(testCase));
  return new Response(
    JSON.stringify(
      complete(expectedAnswer(testCase.referenceUtc, testCase.offsetHours)),
    ),
  );
};
const options = async (changes = {}) => ({
  root,
  privateDir: await mkdtemp(path.join(tmpdir(), 'etm-pilot-test-')),
  approval: await approval(),
  key,
  now,
  killSwitch: () => undefined,
  mode: 'FIXTURE',
  fetchImpl: fakeFetch,
  ...changes,
});

test('temporal oracle covers year, leap day and fixed-offset calendar crossings', () => {
  assert.deepEqual(expectedAnswer('2024-03-01T00:01:00.000Z', -12), {
    date: '2024-02-29',
    weekday: 'Thursday',
  });
  assert.deepEqual(expectedAnswer('2025-12-31T23:59:00.000Z', 14), {
    date: '2026-01-01',
    weekday: 'Thursday',
  });
  assert.deepEqual(expectedAnswer('2026-01-01T00:01:00.000Z', -12), {
    date: '2025-12-31',
    weekday: 'Wednesday',
  });
  assert.throws(() => expectedAnswer('not-a-date', 0));
  assert.throws(() => expectedAnswer(now(), 3));
});
test('protocol has bounded requests and a reservation below approved USD 1', () => {
  assert.equal(reservationUsd, 0.04032);
  for (const item of cases) {
    const request = makeRequest(item);
    assert.ok(
      Buffer.byteLength(JSON.stringify(request)) < protocol.maxInputBytes,
    );
    assert.equal(request.max_output_tokens, 256);
    assert.equal(request.store, false);
    assert.match(request.input, /json/i);
    assert.deepEqual(request.tools, []);
  }
});
test('scoring separates matches, mismatches and inconclusive responses', () => {
  const answer = expectedAnswer(now(), 0);
  assert.equal(score(cases[0], complete(answer)).verdict, 'MATCH');
  assert.equal(
    score(cases[0], complete({ date: answer.date, weekday: 'Tuesday' }))
      .verdict,
    'MISMATCH',
  );
  for (const response of [
    null,
    { ...complete(answer), status: 'incomplete' },
    complete({}),
    {
      ...complete(answer),
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'refusal', refusal: 'No' }],
        },
      ],
    },
  ]) {
    assert.equal(score(cases[0], response).verdict, 'INCONCLUSIVE');
  }
  assert.equal(usageCost({}), null);
});
test('default CLI is a no-network plan and does not load credentials', () => {
  const result = spawnSync(process.execPath, ['scripts/probes/cli.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, OPENAI_API_KEY: key },
  });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).mode, 'PLAN_ONLY_NO_NETWORK');
  assert.ok(!result.stdout.includes(key));
});
test('approval rejects expired, future, long-lived, changed implementation and insufficient budget', async () => {
  for (const changes of [
    { expiresAt: now() },
    { issuedAt: '2026-09-05T01:00:00.000Z' },
    { expiresAt: '2026-09-07T00:00:00.000Z' },
    { implementationSha256: '0'.repeat(64) },
    { budgetUsd: 0.01 },
    { budgetUsd: 2 },
    { id: '../escape' },
    { extra: true },
  ]) {
    await assert.rejects(checkApproval(root, await approval(changes), now()));
  }
  await assert.rejects(
    checkApproval(root, await approval(), now(), '1'),
    /KILL_SWITCH/,
  );
});
test('one-use pilot records three independently verified private trials and refuses repeat spend', async () => {
  const settings = await options();
  const { candidate, directory } = await runPilot(settings);
  assert.equal(candidate.status, 'COMPLETED');
  assert.equal(candidate.mode, 'FIXTURE');
  assert.deepEqual(
    candidate.trials.map((item) => item.score.verdict),
    ['MATCH', 'MATCH', 'MATCH'],
  );
  assert.equal(await verifyCandidate(root, candidate), true);
  assert.ok(
    !(await readFile(path.join(directory, 'candidate.json'), 'utf8')).includes(
      key,
    ),
  );
  await assert.rejects(
    runPilot({ ...settings, approval: await approval({ id: 'another-id' }) }),
  );
  const tampered = structuredClone(candidate);
  tampered.trials[0].score.verdict = 'MISMATCH';
  await assert.rejects(verifyCandidate(root, tampered), /SCORE_MISMATCH/);
  tampered.trials[0].exchange.raw += ' ';
  await assert.rejects(
    verifyCandidate(root, tampered),
    /EVIDENCE_HASH_MISMATCH/,
  );
});
test('preflight errors stop before inference and do not retry', async () => {
  let calls = 0;
  const { candidate } = await runPilot(
    await options({
      fetchImpl: async () => {
        calls++;
        return new Response('{}', { status: 401 });
      },
    }),
  );
  assert.equal(calls, 1);
  assert.equal(candidate.error, 'API_AUTH_FAILED');
  assert.equal(candidate.trials.length, 0);
  await verifyCandidate(root, candidate);
});
test('quota errors preserve attempt evidence and stop without retry', async () => {
  let calls = 0;
  const { candidate } = await runPilot(
    await options({
      fetchImpl: async (url, opts) => {
        calls++;
        return opts.method === 'GET'
          ? fakeFetch(url, opts)
          : new Response(
              JSON.stringify({ error: { code: 'insufficient_quota' } }),
              { status: 429 },
            );
      },
    }),
  );
  assert.equal(calls, 2);
  assert.equal(candidate.error, 'API_INSUFFICIENT_QUOTA');
  assert.equal(candidate.trials[0].score.verdict, 'INCONCLUSIVE');
  await verifyCandidate(root, candidate);
});
test('uncertain network errors consume approval and do not expose error text', async () => {
  let calls = 0;
  const settings = await options({
    fetchImpl: async (url, opts) => {
      calls++;
      if (opts.method === 'GET') return fakeFetch(url, opts);
      throw new Error(`network failed with ${key}`);
    },
  });
  const { candidate } = await runPilot(settings);
  assert.equal(calls, 2);
  assert.equal(candidate.error, 'NETWORK_OR_LOCAL_ERROR');
  assert.ok(!JSON.stringify(candidate).includes(key));
  await verifyCandidate(root, candidate);
  await assert.rejects(runPilot(settings));
});
test('kill switch is checked before each paid request', async () => {
  let calls = 0;
  const { candidate } = await runPilot(
    await options({
      killSwitch: () => (calls ? '1' : undefined),
      fetchImpl: async (...args) => {
        calls++;
        return fakeFetch(...args);
      },
    }),
  );
  assert.equal(calls, 1);
  assert.equal(candidate.error, 'KILL_SWITCH');
  assert.equal(candidate.trials.length, 0);
});
test('transport restricts host, redirects and response size and redacts secrets', async () => {
  await assert.rejects(
    exchangeRequest('https://example.com', null, key),
    /UNTRUSTED_ENDPOINT/,
  );
  const exchange = await exchangeRequest(
    protocol.endpoint,
    {},
    key,
    async () => new Response(key, { headers: { 'x-request-id': key } }),
  );
  assert.equal(exchange.raw, '[REDACTED]');
  assert.equal(exchange.requestId, null);
  assert.equal(exchange.redacted, true);
  await assert.rejects(
    exchangeRequest(
      protocol.endpoint,
      {},
      key,
      async () => new Response('x'.repeat(262145)),
    ),
    /RESPONSE_TOO_LARGE/,
  );
  assert.equal(safeError(new Error(`secret ${key}`)), 'NETWORK_OR_LOCAL_ERROR');
});
test('manual protocol does not enable scheduled execution or evidence acceptance', async () => {
  const policy = JSON.parse(
    await readFile(
      path.join(root, 'config/probe-execution-policy.json'),
      'utf8',
    ),
  );
  assert.equal(policy.execution_enabled, false);
  assert.equal(policy.max_runs_per_day, 0);
  assert.equal(policy.max_total_tokens_per_day, 0);
  assert.deepEqual(policy.methodologies, []);
});
