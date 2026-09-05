import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runAutomatedCandidate,
  stageAutomatedCandidate,
  validateAutomatedPolicy,
  verifyAutomatedCandidate,
} from '../scripts/probes/automated.mjs';
import {
  expectedAnswer,
  makeCases,
  makeRequest,
  protocol,
} from '../scripts/probes/protocol.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const now = () => '2026-09-05T12:00:00.000Z';
const key = 'fixture-only-secret-not-a-real-key';
const complete = (answer) => ({
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
const fixtureFetch = async (_url, options) => {
  if (options.method === 'GET')
    return new Response(JSON.stringify({ id: protocol.model }));
  const request = JSON.parse(options.body);
  const testCase = cases.find(
    (item) => makeRequest(item).input === request.input,
  );
  assert.ok(testCase);
  return new Response(
    JSON.stringify(
      complete(expectedAnswer(testCase.referenceUtc, testCase.offsetHours)),
    ),
  );
};

test('disabled scheduled policy performs no network request even when a key exists', async () => {
  let calls = 0;
  const outputPath = path.join(
    await mkdtemp(path.join(tmpdir(), 'etm-auto-disabled-')),
    'run.json',
  );
  const candidate = await runAutomatedCandidate({
    root,
    outputPath,
    key,
    fetchImpl: async () => {
      calls++;
      throw new Error('network must remain unused');
    },
    now,
  });
  assert.equal(calls, 0);
  assert.equal(candidate.status, 'DISABLED');
  assert.equal(candidate.candidateReady, false);
  await verifyAutomatedCandidate(root, candidate);
});

test('fixture exercises one model and protocol and emits a sanitized pending candidate', async () => {
  const outputPath = path.join(
    await mkdtemp(path.join(tmpdir(), 'etm-auto-fixture-')),
    'candidate.json',
  );
  const candidate = await runAutomatedCandidate({
    root,
    outputPath,
    key,
    fetchImpl: fixtureFetch,
    now,
    mode: 'FIXTURE',
    allowDisabledFixture: true,
  });
  assert.equal(candidate.status, 'COMPLETED');
  assert.equal(candidate.candidateReady, true);
  assert.equal(candidate.reviewStatus, 'PENDING_REVIEW');
  assert.deepEqual(
    candidate.trials.map((trial) => trial.score.verdict),
    ['MATCH', 'MATCH', 'MATCH'],
  );
  assert.equal(candidate.totals.inputTokens, 300);
  assert.equal(candidate.totals.outputTokens, 90);
  assert.equal(await verifyAutomatedCandidate(root, candidate), true);
  const serialized = await readFile(outputPath, 'utf8');
  assert.ok(!serialized.includes(key));
  assert.ok(!serialized.includes('requestId'));
  assert.ok(!serialized.includes('raw'));

  const tampered = structuredClone(candidate);
  tampered.trials[0].score.verdict = 'MISMATCH';
  await assert.rejects(
    verifyAutomatedCandidate(root, tampered),
    /SCORE_MISMATCH/,
  );
});

test('staging writes only a non-canonical evidence candidate', async () => {
  const sandbox = await mkdtemp(path.join(tmpdir(), 'etm-auto-stage-'));
  await mkdir(path.join(sandbox, 'config'));
  await mkdir(path.join(sandbox, 'schemas'));
  await copyFile(
    path.join(root, 'config/automated-probe-candidate.json'),
    path.join(sandbox, 'config/automated-probe-candidate.json'),
  );
  await copyFile(
    path.join(root, 'schemas/automated-probe-candidate.schema.json'),
    path.join(sandbox, 'schemas/automated-probe-candidate.schema.json'),
  );
  const candidate = await runAutomatedCandidate({
    root: sandbox,
    outputPath: path.join(sandbox, '.probe-candidates', 'run.json'),
    key,
    fetchImpl: fixtureFetch,
    now,
    mode: 'FIXTURE',
    allowDisabledFixture: true,
  });
  const relative = await stageAutomatedCandidate(sandbox, candidate);
  assert.match(relative, /^data\/evidence-candidates\//);
  assert.equal(
    JSON.parse(await readFile(path.join(sandbox, relative), 'utf8'))
      .candidateReady,
    true,
  );
});

test('policy and workflow forbid automatic acceptance, merge and publication', async () => {
  const policy = JSON.parse(
    await readFile(
      path.join(root, 'config/automated-probe-candidate.json'),
      'utf8',
    ),
  );
  assert.equal(validateAutomatedPolicy(policy), true);
  assert.equal(policy.execution_enabled, false);
  assert.equal(policy.review.automatic_acceptance, false);
  assert.equal(policy.review.automatic_merge, false);
  assert.equal(policy.review.automatic_publication, false);
  const workflow = await readFile(
    path.join(root, '.github/workflows/probe-candidate.yml'),
    'utf8',
  );
  assert.match(workflow, /draft: true/);
  assert.doesNotMatch(workflow, /pull_request_target|enable-auto-merge/);
  assert.match(
    workflow,
    /if: needs\.probe\.outputs\.candidate_ready == 'true'/,
  );
  assert.match(workflow, /data\/evidence-candidates\/\*\.json/);
});
