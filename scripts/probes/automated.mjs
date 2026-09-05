import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  expectedAnswer,
  makeCases,
  makeRequest,
  protocol,
  score,
  sha256,
  usageCost,
} from './protocol.mjs';
import { apiError, exchangeRequest, safeError } from './pilot.mjs';

const policyPath = 'config/automated-probe-candidate.json';
const acceptedModels = [protocol.model, 'gpt-5.4-mini-2026-03-17'];

export async function loadAutomatedPolicy(root) {
  return JSON.parse(await readFile(path.join(root, policyPath), 'utf8'));
}

export function validateAutomatedPolicy(policy) {
  const target = policy?.target;
  const limits = policy?.limits;
  const review = policy?.review;
  if (
    policy?.schema_version !== '1.0.0' ||
    target?.vendor_id !== protocol.provider ||
    target?.surface_id !== protocol.surface ||
    target?.model !== protocol.model ||
    target?.protocol !== protocol.id ||
    limits?.max_runs_per_day !== 1 ||
    limits?.max_invocations_per_run !== protocol.maxCalls ||
    limits?.max_input_tokens_per_invocation !== protocol.reservedInputTokens ||
    limits?.max_output_tokens_per_invocation !== protocol.maxOutputTokens ||
    limits?.max_estimated_usd_per_run !== protocol.approvedBudgetUsd ||
    review?.candidate_only !== true ||
    review?.draft_pull_request !== true ||
    review?.automatic_acceptance !== false ||
    review?.automatic_merge !== false ||
    review?.automatic_publication !== false
  )
    throw new Error('INVALID_AUTOMATED_POLICY');
  return true;
}

async function validateSchema(root, candidate) {
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const schema = JSON.parse(
    await readFile(
      path.join(root, 'schemas/automated-probe-candidate.schema.json'),
      'utf8',
    ),
  );
  const validate = ajv.compile(schema);
  if (!validate(candidate)) throw new Error('INVALID_AUTOMATED_CANDIDATE');
}

function baseCandidate(policy, startedAt, mode) {
  const policySha256 = sha256(JSON.stringify(policy));
  return {
    schemaVersion: '1.0.0',
    candidateId: `auto-openai-gpt-5-4-mini-${startedAt.slice(0, 10)}-${policySha256.slice(0, 8)}`,
    mode,
    status: 'ABORTED',
    error: null,
    candidateReady: false,
    reviewStatus: 'PENDING_REVIEW',
    protocol: protocol.id,
    target: {
      vendorId: protocol.provider,
      surfaceId: protocol.surface,
      requestedModel: protocol.model,
      returnedModel: null,
    },
    policySha256,
    startedAt,
    finishedAt: startedAt,
    preflight: null,
    trials: [],
    totals: { inputTokens: 0, outputTokens: 0, estimatedUsageUsd: 0 },
    limitations: [
      'This is a sanitized behavioral evidence candidate, not an accepted observation.',
      'Raw provider responses and request identifiers are intentionally excluded from Git and pull requests.',
      'Human review and a separate promotion change are required before canonical evidence or public data can change.',
    ],
  };
}

function sanitizedPreflight(exchange) {
  let modelId = null;
  try {
    const parsedId = JSON.parse(exchange.raw).id;
    modelId = typeof parsedId === 'string' ? parsedId : null;
  } catch {
    // The HTTP status and response hash still preserve a bounded failure record.
  }
  return {
    httpStatus: exchange.httpStatus,
    modelId,
    responseSha256: exchange.rawSha256,
  };
}

function sanitizedTrial(testCase, request, exchange, response) {
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  return {
    testCase,
    requestSha256: sha256(JSON.stringify(request)),
    responseSha256: exchange.rawSha256,
    returnedModel: response.model,
    score: score(testCase, response),
    usage: { inputTokens, outputTokens },
    estimatedUsageUsd: usageCost(response),
  };
}

export async function runAutomatedCandidate({
  root,
  outputPath = path.join(root, '.probe-candidates', 'run.json'),
  key,
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
  mode = 'LIVE',
  allowDisabledFixture = false,
}) {
  if (!['LIVE', 'FIXTURE'].includes(mode)) throw new Error('INVALID_MODE');
  const policy = await loadAutomatedPolicy(root);
  validateAutomatedPolicy(policy);
  const candidate = baseCandidate(policy, now(), mode);
  const save = async () => {
    candidate.finishedAt = now();
    await validateSchema(root, candidate);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(candidate, null, 2)}\n`, {
      mode: 0o600,
    });
  };

  if (
    !policy.execution_enabled &&
    !(mode === 'FIXTURE' && allowDisabledFixture)
  ) {
    candidate.status = 'DISABLED';
    candidate.error = 'EXECUTION_POLICY_DISABLED';
    await save();
    return candidate;
  }
  if (mode === 'LIVE' && process.env.GITHUB_ACTIONS !== 'true')
    throw new Error('AUTOMATED_LIVE_CI_ONLY');
  if (
    mode === 'LIVE' &&
    Date.parse(candidate.startedAt) - Date.parse(protocol.pricingCheckedOn) >
      7 * 86400000
  )
    throw new Error('PRICING_RECHECK_REQUIRED');
  if (!key || /[\r\n]/.test(key)) throw new Error('KEY_MISSING_OR_INVALID');

  try {
    const preflight = await exchangeRequest(
      `https://api.openai.com/v1/models/${protocol.model}`,
      null,
      key,
      fetchImpl,
    );
    candidate.preflight = sanitizedPreflight(preflight);
    if (preflight.httpStatus !== 200) throw new Error(apiError(preflight));
    if (candidate.preflight.modelId !== protocol.model)
      throw new Error('PREFLIGHT_ID_MISMATCH');

    for (const testCase of makeCases(candidate.startedAt)) {
      const request = makeRequest(testCase);
      const exchange = await exchangeRequest(
        protocol.endpoint,
        request,
        key,
        fetchImpl,
      );
      if (exchange.httpStatus !== 200) throw new Error(apiError(exchange));
      const response = JSON.parse(exchange.raw);
      if (!acceptedModels.includes(response.model))
        throw new Error('RETURNED_MODEL_CHANGED');
      const cost = usageCost(response);
      if (
        cost === null ||
        response.usage.input_tokens >
          policy.limits.max_input_tokens_per_invocation ||
        response.usage.output_tokens >
          policy.limits.max_output_tokens_per_invocation
      )
        throw new Error('USAGE_UNKNOWN_OR_LIMIT_EXCEEDED');
      const trial = sanitizedTrial(testCase, request, exchange, response);
      if (trial.score.verdict === 'INCONCLUSIVE')
        throw new Error('INCONCLUSIVE_RESPONSE');
      candidate.trials.push(trial);
      candidate.totals.inputTokens += trial.usage.inputTokens;
      candidate.totals.outputTokens += trial.usage.outputTokens;
      candidate.totals.estimatedUsageUsd += trial.estimatedUsageUsd;
      if (
        candidate.totals.estimatedUsageUsd >
        policy.limits.max_estimated_usd_per_run
      )
        throw new Error('RUN_BUDGET_EXCEEDED');
      candidate.target.returnedModel = response.model;
    }
    candidate.status = 'COMPLETED';
    candidate.candidateReady = candidate.trials.length === protocol.maxCalls;
  } catch (error) {
    candidate.error = safeError(error);
  }
  await save();
  return candidate;
}

export async function verifyAutomatedCandidate(root, candidate) {
  await validateSchema(root, candidate);
  const policy = await loadAutomatedPolicy(root);
  validateAutomatedPolicy(policy);
  if (candidate.policySha256 !== sha256(JSON.stringify(policy)))
    throw new Error('POLICY_CHANGED');
  if (
    candidate.target.vendorId !== protocol.provider ||
    candidate.target.surfaceId !== protocol.surface ||
    candidate.target.requestedModel !== protocol.model ||
    candidate.protocol !== protocol.id
  )
    throw new Error('TARGET_CHANGED');
  if (
    candidate.candidateReady !==
    (candidate.status === 'COMPLETED' &&
      candidate.trials.length === protocol.maxCalls &&
      candidate.error === null)
  )
    throw new Error('INVALID_CANDIDATE_READINESS');
  if (Date.parse(candidate.finishedAt) < Date.parse(candidate.startedAt))
    throw new Error('INVALID_CHRONOLOGY');

  const cases = makeCases(candidate.startedAt);
  let inputTokens = 0;
  let outputTokens = 0;
  let estimatedUsageUsd = 0;
  for (const [index, trial] of candidate.trials.entries()) {
    const testCase = cases[index];
    if (JSON.stringify(trial.testCase) !== JSON.stringify(testCase))
      throw new Error('CASE_MISMATCH');
    if (trial.requestSha256 !== sha256(JSON.stringify(makeRequest(testCase))))
      throw new Error('REQUEST_HASH_MISMATCH');
    const expected = expectedAnswer(
      testCase.referenceUtc,
      testCase.offsetHours,
    );
    if (
      JSON.stringify(trial.score.expected) !== JSON.stringify(expected) ||
      !['MATCH', 'MISMATCH'].includes(trial.score.verdict) ||
      !trial.score.actual
    )
      throw new Error('SCORE_MISMATCH');
    const isMatch =
      trial.score.actual.date === expected.date &&
      trial.score.actual.weekday === expected.weekday;
    if ((trial.score.verdict === 'MATCH') !== isMatch)
      throw new Error('SCORE_MISMATCH');
    if (!acceptedModels.includes(trial.returnedModel))
      throw new Error('RETURNED_MODEL_CHANGED');
    inputTokens += trial.usage.inputTokens;
    outputTokens += trial.usage.outputTokens;
    estimatedUsageUsd += trial.estimatedUsageUsd;
  }
  if (
    candidate.totals.inputTokens !== inputTokens ||
    candidate.totals.outputTokens !== outputTokens ||
    Math.abs(candidate.totals.estimatedUsageUsd - estimatedUsageUsd) > 1e-12
  )
    throw new Error('TOTALS_MISMATCH');
  return true;
}

export async function stageAutomatedCandidate(root, candidate) {
  await verifyAutomatedCandidate(root, candidate);
  if (!candidate.candidateReady) throw new Error('CANDIDATE_NOT_READY');
  const relative = `data/evidence-candidates/${candidate.candidateId}.json`;
  await mkdir(path.join(root, 'data/evidence-candidates'), { recursive: true });
  await writeFile(
    path.join(root, relative),
    `${JSON.stringify(candidate, null, 2)}\n`,
    { flag: 'wx' },
  );
  const verdicts = candidate.trials.map((trial) => trial.score.verdict);
  const body = [
    '# Review automated probe evidence candidate',
    '',
    `- Candidate: \`${candidate.candidateId}\``,
    `- Target: \`${candidate.target.requestedModel}\` on \`${candidate.target.surfaceId}\``,
    `- Protocol: \`${candidate.protocol}\``,
    `- Results: ${verdicts.join(', ')}`,
    `- Estimated usage: $${candidate.totals.estimatedUsageUsd.toFixed(6)} (not an invoice)`,
    '',
    'This draft changes only a non-canonical candidate file. It does not accept evidence, add an observation, compile public data, publish the Site, or merge itself. A maintainer must review provenance and create a separate promotion change.',
    '',
  ].join('\n');
  const privateDir = path.join(root, '.probe-candidates');
  await mkdir(privateDir, { recursive: true });
  await writeFile(path.join(privateDir, 'pr-body.md'), body);
  return relative;
}
