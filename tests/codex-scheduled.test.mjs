import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  expectedAnswer,
  makeCases,
  sha256,
} from '../scripts/probes/protocol.mjs';
import {
  loadScheduledCodexPolicy,
  runScheduledCodex,
  sanitizeCodexCandidate,
  stageScheduledCodexCandidate,
  validateScheduledCodexPolicy,
  verifyScheduledCodexCandidate,
} from '../scripts/probes/codex-scheduled.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const startedAt = '2026-09-08T15:00:00.000Z';
const privateCandidate = () => ({
  status: 'COMPLETED',
  error: null,
  startedAt,
  finishedAt: '2026-09-08T15:03:00.000Z',
  trials: makeCases(startedAt).map((testCase) => {
    const answer = expectedAnswer(testCase.referenceUtc, testCase.offsetHours);
    return {
      testCase,
      prompt: 'private prompt must not survive',
      capture: {
        stdout: 'private raw output must not survive',
        stderr: '',
        sha256: sha256(JSON.stringify(['fixture', testCase.id])),
      },
      analysis: {
        verdict: 'MATCH',
        expected: answer,
        actual: answer,
        usage: { inputTokens: 1000, outputTokens: 40 },
        error: null,
      },
    };
  }),
});

test('scheduled Codex policy is one Luna/low run with review-only output', async () => {
  const policy = await loadScheduledCodexPolicy(root);
  assert.equal(validateScheduledCodexPolicy(policy), true);
  assert.equal(policy.execution_enabled, true);
  assert.equal(policy.limits.max_runs_per_utc_day, 1);
  assert.equal(policy.limits.max_invocations_per_run, 3);
  assert.equal(policy.review.automatic_acceptance, false);
  assert.equal(policy.review.automatic_merge, false);
  assert.equal(policy.review.automatic_publication, false);
});

test('sanitization removes raw captures and produces a verifiable candidate', async () => {
  const candidate = sanitizeCodexCandidate(
    privateCandidate(),
    await loadScheduledCodexPolicy(root),
  );
  assert.equal(candidate.candidateReady, true);
  assert.deepEqual(
    candidate.trials.map((trial) => trial.verdict),
    ['MATCH', 'MATCH', 'MATCH'],
  );
  assert.equal(await verifyScheduledCodexCandidate(root, candidate), true);
  const serialized = JSON.stringify(candidate);
  assert.ok(!serialized.includes('private prompt'));
  assert.ok(!serialized.includes('private raw output'));
  assert.ok(!serialized.includes('stdout'));

  const tampered = structuredClone(candidate);
  tampered.trials[0].verdict = 'MISMATCH';
  await assert.rejects(
    verifyScheduledCodexCandidate(root, tampered),
    /VERDICT_MISMATCH/,
  );
});

test('staging is non-canonical and live execution requires scheduled context', async () => {
  await assert.rejects(
    runScheduledCodex({ root, authorized: () => undefined }),
    /SCHEDULED_TASK_CONTEXT_REQUIRED/,
  );
  const sandbox = await mkdtemp(path.join(tmpdir(), 'etm-codex-stage-'));
  for (const directory of ['config', 'schemas'])
    await mkdir(path.join(sandbox, directory));
  for (const relative of [
    'config/codex-scheduled-probe.json',
    'schemas/codex-scheduled-candidate.schema.json',
  ])
    await copyFile(path.join(root, relative), path.join(sandbox, relative));
  const candidate = sanitizeCodexCandidate(
    privateCandidate(),
    await loadScheduledCodexPolicy(sandbox),
  );
  const staged = await stageScheduledCodexCandidate(sandbox, candidate);
  assert.match(staged, /^data\/evidence-candidates\//);
  assert.equal(
    JSON.parse(await readFile(path.join(sandbox, staged), 'utf8')).reviewStatus,
    'PENDING_REVIEW',
  );
});

test('GitHub proposal workflow creates draft PRs and cannot merge or publish', async () => {
  const workflow = await readFile(
    path.join(root, '.github/workflows/propose-codex-candidate.yml'),
    'utf8',
  );
  assert.match(workflow, /gh pr create[^\n]+--draft/);
  assert.doesNotMatch(
    workflow,
    /gh pr merge|enable-auto-merge|pages\/deploy|OPENAI_API_KEY/,
  );
});
