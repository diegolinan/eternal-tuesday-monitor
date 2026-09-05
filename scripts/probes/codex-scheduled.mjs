import { spawnSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { makeCases, sha256 } from './protocol.mjs';
import { codexProtocol } from './codex-protocol.mjs';
import {
  binaryHash,
  codexImplementationHash,
  executeCodexProcess,
  runCodexPilot,
  safeCodexError,
  verifyCodexCandidate,
} from './codex-runner.mjs';

const policyFile = 'config/codex-scheduled-probe.json';
const implementationFiles = [
  'scripts/probes/protocol.mjs',
  'scripts/probes/codex-protocol.mjs',
  'scripts/probes/codex-runner.mjs',
  'scripts/probes/codex-cli.mjs',
  'schemas/codex-pilot-approval.schema.json',
  'schemas/codex-pilot-candidate.schema.json',
];

export async function loadScheduledCodexPolicy(root) {
  return JSON.parse(await readFile(path.join(root, policyFile), 'utf8'));
}

export function validateScheduledCodexPolicy(policy) {
  if (
    policy?.schema_version !== '1.0.0' ||
    policy?.execution_enabled !== true ||
    policy?.model !== 'gpt-5.6-luna' ||
    policy?.reasoning_effort !== 'low' ||
    policy?.protocol !== codexProtocol.id ||
    policy?.limits?.max_runs_per_utc_day !== 1 ||
    policy?.limits?.max_invocations_per_run !== codexProtocol.maxInvocations ||
    policy?.limits?.timeout_ms_per_invocation !== codexProtocol.timeoutMs ||
    policy?.limits?.stop_after_input_tokens_per_invocation !==
      codexProtocol.stopAfterInputTokens ||
    policy?.limits?.stop_after_output_tokens_per_invocation !==
      codexProtocol.stopAfterOutputTokens ||
    policy?.limits?.monetary_cap_enforced !== false ||
    policy?.authorization?.channel !== 'CHATGPT_WORKSPACE' ||
    policy?.authorization?.accept_uncapped_workspace_usage !== true ||
    policy?.authorization?.scope !==
      'Recurring weekly evidence candidates only' ||
    policy?.review?.candidate_only !== true ||
    policy?.review?.draft_pull_request !== true ||
    policy?.review?.automatic_acceptance !== false ||
    policy?.review?.automatic_merge !== false ||
    policy?.review?.automatic_publication !== false
  )
    throw new Error('INVALID_SCHEDULED_CODEX_POLICY');
  return true;
}

async function validateCandidateSchema(root, candidate) {
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const schema = JSON.parse(
    await readFile(
      path.join(root, 'schemas/codex-scheduled-candidate.schema.json'),
      'utf8',
    ),
  );
  const validate = ajv.compile(schema);
  if (!validate(candidate))
    throw new Error('INVALID_SCHEDULED_CODEX_CANDIDATE');
}

export function sanitizeCodexCandidate(privateCandidate, policy) {
  validateScheduledCodexPolicy(policy);
  const privateCandidateSha256 = sha256(JSON.stringify(privateCandidate));
  const trials = privateCandidate.trials
    .filter(
      (trial) =>
        ['MATCH', 'MISMATCH'].includes(trial.analysis?.verdict) &&
        trial.analysis?.actual &&
        trial.analysis?.usage &&
        trial.capture?.sha256,
    )
    .map((trial) => ({
      testCase: trial.testCase,
      verdict: trial.analysis.verdict,
      expected: trial.analysis.expected,
      actual: trial.analysis.actual,
      usage: trial.analysis.usage,
      captureSha256: trial.capture.sha256,
    }));
  const candidateReady =
    privateCandidate.status === 'COMPLETED' &&
    privateCandidate.error === null &&
    trials.length === codexProtocol.maxInvocations;
  return {
    schemaVersion: '1.0.0',
    candidateId: `scheduled-codex-luna-${privateCandidate.startedAt.slice(0, 10)}-${privateCandidateSha256.slice(0, 8)}`,
    status: privateCandidate.status,
    error: privateCandidate.error,
    candidateReady,
    reviewStatus: 'PENDING_REVIEW',
    protocol: codexProtocol.id,
    surface: codexProtocol.surface,
    requestedModel: policy.model,
    returnedModel: null,
    reasoningEffort: policy.reasoning_effort,
    policySha256: sha256(JSON.stringify(policy)),
    privateCandidateSha256,
    startedAt: privateCandidate.startedAt,
    finishedAt: privateCandidate.finishedAt,
    billing: {
      channel: 'CHATGPT_WORKSPACE',
      costUsd: null,
      creditsCharged: null,
      monetaryCapEnforced: false,
    },
    trials,
    limitations: [
      'This is a pending Codex/Business workspace evidence candidate, not an accepted observation.',
      'The requested CLI model is recorded, but the backend model identity and charged workspace credits are not reported.',
      'Raw captures, local identifiers and authentication material remain outside Git.',
      'A human-reviewed promotion change is required before evidence, observations, releases or the public Site can change.',
    ],
  };
}

async function prepareRunRoot(root, receiptDirectory) {
  const runRoot = await mkdtemp(path.join(receiptDirectory, 'run-'));
  for (const relative of implementationFiles) {
    const target = path.join(runRoot, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(root, relative), target);
  }
  return runRoot;
}

async function resolveCodexBinary() {
  const located = spawnSync('where.exe', ['codex.exe'], {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  });
  const first = located.stdout?.split(/\r?\n/).find(Boolean);
  if (located.status !== 0 || !first) throw new Error('CODEX_BINARY_NOT_FOUND');
  return realpath(first.trim());
}

export async function runScheduledCodex({
  root,
  now = () => new Date().toISOString(),
  authorized = () => process.env.ETM_SCHEDULED_CODEX_RUN,
}) {
  const policy = await loadScheduledCodexPolicy(root);
  validateScheduledCodexPolicy(policy);
  if (authorized() !== '1') throw new Error('SCHEDULED_TASK_CONTEXT_REQUIRED');
  const startedAt = now();
  const day = startedAt.slice(0, 10);
  const receiptDirectory = path.join(root, '.probes', 'codex-scheduled');
  await mkdir(receiptDirectory, { recursive: true });
  await writeFile(
    path.join(receiptDirectory, `${day}.lock`),
    `${JSON.stringify({ model: policy.model, startedAt })}\n`,
    { flag: 'wx', mode: 0o600 },
  );

  const binary = await resolveCodexBinary();
  const runRoot = await prepareRunRoot(root, receiptDirectory);
  const version = await executeCodexProcess(binary, ['--version'], {
    directory: runRoot,
    timeoutMs: 10000,
  });
  if (version.error || version.exitCode !== 0 || !version.stdout.trim())
    throw new Error('CLI_VERSION_MISMATCH');
  const approval = {
    id: `scheduled-luna-${startedAt.replace(/\D/g, '').slice(0, 14)}`,
    protocol: codexProtocol.id,
    implementationSha256: await codexImplementationHash(runRoot),
    model: policy.model,
    binarySha256: await binaryHash(binary),
    cliVersion: version.stdout.trim(),
    issuedAt: startedAt,
    expiresAt: new Date(Date.parse(startedAt) + 23 * 3600000).toISOString(),
    maxInvocations: codexProtocol.maxInvocations,
    acceptUncappedWorkspaceUsage: true,
  };
  const { candidate: privateCandidate } = await runCodexPilot({
    root: runRoot,
    approval,
    binary,
    now,
  });
  await verifyCodexCandidate(runRoot, privateCandidate);
  const candidate = sanitizeCodexCandidate(privateCandidate, policy);
  await validateCandidateSchema(root, candidate);
  const output = path.join(root, '.probe-candidates', 'codex-run.json');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(candidate, null, 2)}\n`, {
    mode: 0o600,
  });
  return candidate;
}

export async function verifyScheduledCodexCandidate(root, candidate) {
  await validateCandidateSchema(root, candidate);
  const policy = await loadScheduledCodexPolicy(root);
  validateScheduledCodexPolicy(policy);
  if (candidate.policySha256 !== sha256(JSON.stringify(policy)))
    throw new Error('SCHEDULED_POLICY_CHANGED');
  if (
    candidate.candidateReady !==
    (candidate.status === 'COMPLETED' &&
      candidate.error === null &&
      candidate.trials.length === codexProtocol.maxInvocations)
  )
    throw new Error('INVALID_CANDIDATE_READINESS');
  const cases = makeCases(candidate.startedAt);
  for (const [index, trial] of candidate.trials.entries()) {
    if (JSON.stringify(trial.testCase) !== JSON.stringify(cases[index]))
      throw new Error('CASE_MISMATCH');
    const isMatch =
      trial.actual.date === trial.expected.date &&
      trial.actual.weekday === trial.expected.weekday;
    if ((trial.verdict === 'MATCH') !== isMatch)
      throw new Error('VERDICT_MISMATCH');
  }
  if (Date.parse(candidate.finishedAt) < Date.parse(candidate.startedAt))
    throw new Error('INVALID_CHRONOLOGY');
  return true;
}

export async function stageScheduledCodexCandidate(root, candidate) {
  await verifyScheduledCodexCandidate(root, candidate);
  if (!candidate.candidateReady) throw new Error('CANDIDATE_NOT_READY');
  const relative = `data/evidence-candidates/${candidate.candidateId}.json`;
  await mkdir(path.join(root, 'data', 'evidence-candidates'), {
    recursive: true,
  });
  await writeFile(
    path.join(root, relative),
    `${JSON.stringify(candidate, null, 2)}\n`,
    { flag: 'wx' },
  );
  return relative;
}

export { safeCodexError };
