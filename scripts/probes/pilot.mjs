import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  protocol,
  reservationUsd,
  sha256,
  makeCases,
  makeRequest,
  score,
  usageCost,
} from './protocol.mjs';

const implementationFiles = [
  'scripts/probes/protocol.mjs',
  'scripts/probes/pilot.mjs',
  'scripts/probes/cli.mjs',
  'schemas/manual-pilot-approval.schema.json',
  'schemas/manual-pilot-candidate.schema.json',
];
export async function implementationHash(root) {
  const entries = await Promise.all(
    implementationFiles.map(async (file) => [
      file,
      sha256(
        (await readFile(path.join(root, file), 'utf8')).replaceAll(
          '\r\n',
          '\n',
        ),
      ),
    ]),
  );
  return sha256(JSON.stringify(entries));
}
export async function assertSchema(root, name, value) {
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(
    JSON.parse(
      await readFile(
        path.join(root, `schemas/manual-pilot-${name}.schema.json`),
        'utf8',
      ),
    ),
  );
  if (!validate(value)) throw new Error(`INVALID_${name.toUpperCase()}_SCHEMA`);
}
export async function checkApproval(root, approval, now, killSwitch) {
  if (killSwitch === '1') throw new Error('KILL_SWITCH');
  await assertSchema(root, 'approval', approval);
  const time = new Date(now).valueOf();
  const issued = new Date(approval.issuedAt).valueOf();
  const expires = new Date(approval.expiresAt).valueOf();
  if (
    !Number.isFinite(time) ||
    issued > time ||
    expires <= time ||
    expires <= issued ||
    expires - issued > 86400000
  )
    throw new Error('APPROVAL_EXPIRED_OR_INVALID');
  if (
    time < Date.parse(protocol.pricingCheckedOn) ||
    time - Date.parse(protocol.pricingCheckedOn) > 7 * 86400000
  )
    throw new Error('PRICING_RECHECK_REQUIRED');
  if (approval.implementationSha256 !== (await implementationHash(root)))
    throw new Error('IMPLEMENTATION_CHANGED');
  if (reservationUsd > approval.budgetUsd) throw new Error('BUDGET_TOO_SMALL');
}
export function safeError(error) {
  const message = error?.message;
  return typeof message === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(message)
    ? message
    : 'NETWORK_OR_LOCAL_ERROR';
}
export function apiError(exchange) {
  let code;
  let type;
  try {
    const error = JSON.parse(exchange.raw).error;
    code = error?.code;
    type = error?.type;
  } catch {
    /* not JSON */
  }
  if (
    type === 'insufficient_quota' ||
    ['insufficient_quota', 'credit_balance_exhausted'].includes(code)
  )
    return 'API_INSUFFICIENT_QUOTA';
  if (code === 'billing_not_active') return 'API_BILLING_NOT_ACTIVE';
  if (exchange.httpStatus === 400) return 'API_INVALID_REQUEST';
  if (exchange.httpStatus === 401) return 'API_AUTH_FAILED';
  if (exchange.httpStatus === 403) return 'API_ACCESS_DENIED';
  if (exchange.httpStatus === 404) return 'API_MODEL_OR_ENDPOINT_UNAVAILABLE';
  if (exchange.httpStatus === 429) return 'API_RATE_LIMIT';
  return 'API_REQUEST_FAILED';
}

export async function exchangeRequest(url, body, key, fetchImpl = fetch) {
  const preflight = `https://api.openai.com/v1/models/${protocol.model}`;
  if (url !== protocol.endpoint && url !== preflight)
    throw new Error('UNTRUSTED_ENDPOINT');
  const response = await fetchImpl(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });
  const reader = response.body?.getReader();
  if (!reader) throw new Error('EMPTY_RESPONSE');
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 262144) throw new Error('RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const original = Buffer.concat(chunks).toString('utf8');
  const raw = key ? original.split(key).join('[REDACTED]') : original;
  // Never save arbitrary headers or error objects, which can contain credentials.
  const requestId = response.headers.get('x-request-id');
  return {
    httpStatus: response.status,
    requestId:
      requestId &&
      /^[a-zA-Z0-9_-]{1,128}$/.test(requestId) &&
      !requestId.includes(key)
        ? requestId
        : null,
    raw,
    rawSha256: sha256(raw),
    redacted: raw !== original,
  };
}

export async function runPilot({
  root,
  privateDir = path.join(root, '.probes'),
  approval,
  key,
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
  killSwitch = () => process.env.ETM_PROBES_KILL_SWITCH,
  mode = 'LIVE',
}) {
  if (
    !['LIVE', 'FIXTURE'].includes(mode) ||
    (mode === 'LIVE' && fetchImpl !== fetch)
  )
    throw new Error('INVALID_MODE');
  if (!key || /[\r\n]/.test(key)) throw new Error('KEY_MISSING_OR_INVALID');
  await checkApproval(root, approval, now(), killSwitch());
  await mkdir(privateDir, { recursive: true });
  // One receipt across ALL approval IDs, consumed before ANY network call.
  // Do not delete it to retry. A fresh human-reviewed budget is required.
  await writeFile(
    path.join(privateDir, 'pilot-spend.lock'),
    JSON.stringify({ approval, reservationUsd, consumedAt: now() }),
    { flag: 'wx', mode: 0o600 },
  );
  const directory = path.join(privateDir, approval.id);
  await mkdir(directory); // Never overwrite an existing evidence bundle.
  const save = (name, object) =>
    writeFile(
      path.join(directory, name),
      JSON.stringify(object, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
  const candidate = {
    schemaVersion: '1.0.0',
    mode,
    reviewStatus: 'PENDING_REVIEW',
    protocol: protocol.id,
    implementationSha256: await implementationHash(root),
    approval,
    startedAt: now(),
    finishedAt: now(),
    reservationUsd,
    status: 'ABORTED',
    error: null,
    preflight: null,
    trials: [],
  };
  try {
    candidate.preflight = await exchangeRequest(
      `https://api.openai.com/v1/models/${protocol.model}`,
      null,
      key,
      fetchImpl,
    );
    await save('preflight.json', candidate.preflight);
    if (candidate.preflight.httpStatus !== 200)
      throw new Error(apiError(candidate.preflight));
    if (JSON.parse(candidate.preflight.raw).id !== protocol.model)
      throw new Error('PREFLIGHT_ID_MISMATCH');
    for (const testCase of makeCases(candidate.startedAt)) {
      await checkApproval(root, approval, now(), killSwitch());
      const request = makeRequest(testCase);
      const trial = {
        testCase,
        request,
        startedAt: now(),
        finishedAt: now(),
        durationMs: 0,
        exchange: null,
        score: score(testCase, null),
        estimatedUsageUsd: null,
      };
      // Persist the attempt BEFORE sending: uncertain timeouts must not be retried.
      await save(`${testCase.id}-request.json`, {
        testCase,
        request,
        startedAt: trial.startedAt,
      });
      candidate.trials.push(trial);
      const start = performance.now();
      try {
        trial.exchange = await exchangeRequest(
          protocol.endpoint,
          request,
          key,
          fetchImpl,
        );
        if (trial.exchange.httpStatus !== 200)
          throw new Error(apiError(trial.exchange));
        const response = JSON.parse(trial.exchange.raw);
        if (
          ![protocol.model, 'gpt-5.4-mini-2026-03-17'].includes(response.model)
        )
          throw new Error('RETURNED_MODEL_CHANGED');
        trial.score = score(testCase, response);
        trial.estimatedUsageUsd = usageCost(response);
        if (
          trial.estimatedUsageUsd === null ||
          response.usage.input_tokens > protocol.reservedInputTokens ||
          response.usage.output_tokens > protocol.maxOutputTokens
        )
          throw new Error('USAGE_UNKNOWN_OR_LIMIT_EXCEEDED');
      } finally {
        trial.finishedAt = now();
        trial.durationMs = performance.now() - start;
        await save(`${testCase.id}-result.json`, trial);
      }
    }
    candidate.status = 'COMPLETED';
  } catch (error) {
    candidate.error = safeError(error);
  }
  candidate.finishedAt = now();
  await assertSchema(root, 'candidate', candidate);
  await save('candidate.json', candidate);
  return { candidate, directory };
}

export async function verifyCandidate(root, candidate) {
  await assertSchema(root, 'candidate', candidate);
  await assertSchema(root, 'approval', candidate.approval);
  if (
    candidate.implementationSha256 !== (await implementationHash(root)) ||
    candidate.approval.implementationSha256 !== candidate.implementationSha256
  )
    throw new Error('IMPLEMENTATION_CHANGED');
  if (
    candidate.reservationUsd !== reservationUsd ||
    candidate.approval.budgetUsd < reservationUsd
  )
    throw new Error('INVALID_RESERVATION');
  if (
    candidate.status === 'COMPLETED' &&
    (candidate.trials.length !== 3 || candidate.error !== null)
  )
    throw new Error('INVALID_COMPLETION');
  await checkApproval(root, candidate.approval, candidate.startedAt);
  if (Date.parse(candidate.finishedAt) < Date.parse(candidate.startedAt))
    throw new Error('INVALID_CHRONOLOGY');
  const checkExchange = (exchange) => {
    if (
      !exchange ||
      typeof exchange.raw !== 'string' ||
      exchange.rawSha256 !== sha256(exchange.raw)
    )
      throw new Error('EVIDENCE_HASH_MISMATCH');
  };
  if (candidate.preflight) checkExchange(candidate.preflight);
  if (
    candidate.trials.length &&
    (candidate.preflight?.httpStatus !== 200 ||
      JSON.parse(candidate.preflight.raw).id !== protocol.model)
  )
    throw new Error('INVALID_PREFLIGHT');
  const cases = makeCases(candidate.startedAt);
  for (const [index, trial] of candidate.trials.entries()) {
    if (
      JSON.stringify(trial.testCase) !== JSON.stringify(cases[index]) ||
      JSON.stringify(trial.request) !==
        JSON.stringify(makeRequest(cases[index]))
    )
      throw new Error('REQUEST_MISMATCH');
    let response = null;
    if (trial.exchange) {
      checkExchange(trial.exchange);
      try {
        response = JSON.parse(trial.exchange.raw);
      } catch {
        /* inconclusive */
      }
    }
    const scorable =
      trial.exchange?.httpStatus === 200 &&
      [protocol.model, 'gpt-5.4-mini-2026-03-17'].includes(response?.model);
    if (
      candidate.status === 'COMPLETED' &&
      (!scorable ||
        usageCost(response) === null ||
        response.usage.input_tokens > protocol.reservedInputTokens ||
        response.usage.output_tokens > protocol.maxOutputTokens)
    )
      throw new Error('INVALID_COMPLETION');
    if (
      JSON.stringify(trial.score) !==
      JSON.stringify(score(trial.testCase, scorable ? response : null))
    )
      throw new Error('SCORE_MISMATCH');
    if (trial.estimatedUsageUsd !== (scorable ? usageCost(response) : null))
      throw new Error('COST_MISMATCH');
  }
  return true; // Integrity and deterministic scoring, not independent proof of origin.
}
