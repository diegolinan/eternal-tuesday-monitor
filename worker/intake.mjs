import { normalizePublicSourceUrl } from '../lib/public-source-url.mjs';

const allowedOrigin = 'https://diegolinan.github.io';
const allowedHostname = 'diegolinan.github.io';
const expectedChallengeAction = 'evidence_submission';
const formSchemaVersion = '2.1.0';
const pendingBranch = 'automation/community-evidence';
const allowedProbeIds = new Set([
  'probe-temporal-anchor',
  'probe-elapsed',
  'probe-revalidation',
  'probe-state-reconciliation',
  'probe-historical-validity',
  'UNSURE',
]);
const allowedRelationships = new Set([
  'NONE',
  'USER',
  'AUTHOR',
  'EMPLOYEE',
  'OTHER',
]);
const bidiAndZeroWidth = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu;

const json = (body, status = 200, origin = null) => {
  const headers = { 'Content-Type': 'application/json', Vary: 'Origin' };
  if (origin === allowedOrigin) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(body), { status, headers });
};

export const sanitizeText = (value, max) =>
  String(value ?? '')
    .normalize('NFC')
    .replace(bidiAndZeroWidth, '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

const utcToday = (now) => now.toISOString().slice(0, 10);

async function readJsonBody(request, maxBytes) {
  if (!request.body) throw new Error('INVALID_JSON');
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('BODY_TOO_LARGE');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('INVALID_JSON');
  }
}

export function validateSubmission(payload, now = new Date()) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return 'INVALID_BODY';
  if (payload.website !== '') return 'BOT_FIELD_FILLED';
  if (payload.formSchemaVersion !== formSchemaVersion)
    return 'FORM_VERSION_EXPIRED';
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      payload.requestId ?? '',
    )
  )
    return 'INVALID_REQUEST_ID';
  if (
    !['FOUND_SOURCE', 'FIRSTHAND_OBSERVATION'].includes(payload.submissionType)
  )
    return 'INVALID_SUBMISSION_TYPE';
  if (!allowedProbeIds.has(payload.probeId)) return 'INVALID_PROBE';
  if (!allowedRelationships.has(payload.relationship))
    return 'INVALID_RELATIONSHIP';
  if (typeof payload.attributionConsent !== 'boolean') return 'INVALID_CONSENT';
  if (!isRealDate(payload.observedOn) || payload.observedOn > utcToday(now))
    return 'INVALID_DATE';
  if (!/^\d+\.\d+\.\d+$/.test(payload.catalogSchemaVersion ?? ''))
    return 'INVALID_CATALOG_VERSION';
  if (
    payload.catalogCheckedThrough !== null &&
    !isRealDate(payload.catalogCheckedThrough)
  )
    return 'INVALID_CATALOG_DATE';

  const summary = sanitizeText(payload.summary, 1801);
  if (summary.length < 30 || summary.length > 1800) return 'INVALID_SUMMARY';
  const productSurface = sanitizeText(payload.productSurface, 161);
  if (!productSurface || productSurface.length > 160)
    return 'INVALID_PRODUCTSURFACE';

  if (!['CATALOG', 'OTHER'].includes(payload.vendorMode))
    return 'INVALID_VENDOR_MODE';
  const vendorId = sanitizeText(payload.vendorId, 121);
  const vendor = sanitizeText(payload.vendor, 81);
  if (!vendor || vendor.length > 80) return 'INVALID_VENDOR';
  if (
    (payload.vendorMode === 'CATALOG' && !vendorId) ||
    (payload.vendorMode === 'OTHER' && vendorId)
  )
    return 'INVALID_VENDOR_IDENTITY';

  if (!['CATALOG', 'OTHER', 'NOT_SPECIFIED'].includes(payload.modelMode))
    return 'INVALID_MODEL_MODE';
  const modelId = sanitizeText(payload.modelId, 121);
  const model = sanitizeText(payload.model, 121);
  if (!model || model.length > 120) return 'INVALID_MODEL';
  if (
    (payload.modelMode === 'CATALOG' &&
      (!modelId || payload.vendorMode !== 'CATALOG')) ||
    (payload.modelMode !== 'CATALOG' && modelId)
  )
    return 'INVALID_MODEL_IDENTITY';

  const submittedSource = sanitizeText(payload.sourceUrl, 2049);
  if (payload.submissionType === 'FOUND_SOURCE' && !submittedSource)
    return 'INVALID_SOURCE_URL';
  if (submittedSource) {
    try {
      const sourceUrl = normalizePublicSourceUrl(submittedSource, {
        rejectPrivate: true,
      });
      if (!sourceUrl || sourceUrl.length > 2048) return 'INVALID_SOURCE_URL';
    } catch {
      return 'INVALID_SOURCE_URL';
    }
  }

  if (payload.submissionType === 'FIRSTHAND_OBSERVATION') {
    if (sanitizeText(payload.expectedBehavior, 1201).length < 15)
      return 'INVALID_EXPECTED_BEHAVIOR';
    if (sanitizeText(payload.actualBehavior, 1201).length < 15)
      return 'INVALID_ACTUAL_BEHAVIOR';
    if (sanitizeText(payload.reproductionSteps, 1801).length < 20)
      return 'INVALID_REPRODUCTION_STEPS';
  }
  if (payload.attributionConsent && !sanitizeText(payload.publicName, 101))
    return 'INVALID_PUBLIC_NAME';
  if (!sanitizeText(payload.turnstileToken, 2049)) return 'MISSING_CHALLENGE';
  if (sanitizeText(payload.turnstileToken, 2049).length > 2048)
    return 'INVALID_CHALLENGE';
  return null;
}

const repositoryHeaders = (env, authenticated = true) => ({
  ...(authenticated
    ? { Authorization: `Bearer ${env.GITHUB_REPOSITORY_TOKEN}` }
    : {}),
  Accept: 'application/vnd.github+json',
  'User-Agent': 'eternal-tuesday-intake',
  'X-GitHub-Api-Version': '2022-11-28',
});

async function checkActionBudget(env, now) {
  const url = new URL(
    `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/intake-evidence.yml/runs`,
  );
  url.searchParams.set('event', 'repository_dispatch');
  url.searchParams.set('per_page', '100');
  const response = await fetch(url, {
    headers: repositoryHeaders(env, false),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('BUDGET_UNAVAILABLE');
  const body = await response.json();
  if (!Array.isArray(body.workflow_runs)) throw new Error('BUDGET_UNAVAILABLE');
  const hourStart = now.valueOf() - 60 * 60 * 1000;
  const dayStart = Date.parse(`${utcToday(now)}T00:00:00.000Z`);
  let hourly = 0;
  let daily = 0;
  for (const run of body.workflow_runs) {
    const created = Date.parse(run.created_at);
    if (!Number.isFinite(created)) continue;
    if (created >= hourStart) hourly++;
    if (created >= dayStart) daily++;
  }
  return (
    hourly < Number(env.INTAKE_HOURLY_BUDGET ?? 12) &&
    daily < Number(env.INTAKE_DAILY_BUDGET ?? 40)
  );
}

async function readCandidateLedger(env, ref) {
  const url = new URL(
    `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/contents/data/evidence-discovery/candidates.jsonl`,
  );
  url.searchParams.set('ref', ref);
  const response = await fetch(url, {
    headers: repositoryHeaders(env),
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('DEDUPE_UNAVAILABLE');
  const body = await response.json();
  if (body.encoding !== 'base64' || typeof body.content !== 'string')
    throw new Error('DEDUPE_UNAVAILABLE');
  return atob(body.content.replace(/\s/g, ''));
}

async function isAlreadyPending(env, sourceUrl, probeId, fingerprint) {
  const raw =
    (await readCandidateLedger(env, pendingBranch)) ??
    (await readCandidateLedger(env, 'main'));
  if (raw === null) return false;
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    let candidate;
    try {
      candidate = JSON.parse(line);
    } catch {
      throw new Error('DEDUPE_UNAVAILABLE');
    }
    const sameIdentity = sourceUrl
      ? candidate.source_url === sourceUrl
      : candidate.submission_fingerprint === fingerprint;
    if (!sameIdentity) continue;
    if (probeId === 'UNSURE' || candidate.probe_ids?.includes(probeId))
      return true;
  }
  return false;
}

function receiptId() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return `ETM-LEAD-${[...bytes].map((byte) => alphabet[byte % alphabet.length]).join('')}`;
}

async function submissionFingerprint(payload) {
  const fields = [
    payload.vendor,
    payload.model,
    payload.productSurface,
    payload.probeId,
    payload.observedOn,
    payload.summary,
    payload.expectedBehavior,
    payload.actualBehavior,
    payload.reproductionSteps,
  ].map((value) => sanitizeText(value, 1800).toLocaleLowerCase());
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(fields)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

const logOutcome = (outcome, detail = {}) =>
  console.log(JSON.stringify({ event: 'public_intake', outcome, ...detail }));

const intakeWorker = {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (origin !== allowedOrigin) {
      logOutcome('rejected', { reason: 'origin' });
      return json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, 403);
    }
    if (request.method === 'OPTIONS')
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        },
      });
    if (request.method === 'GET') {
      if (new URL(request.url).pathname !== '/status')
        return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, origin);
      return json(
        { open: env.INTAKE_OPEN === 'true', formSchemaVersion },
        200,
        origin,
      );
    }
    if (request.method !== 'POST')
      return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, origin);
    if (env.INTAKE_OPEN !== 'true') {
      logOutcome('rejected', { reason: 'closed' });
      return json({ ok: false, error: 'INTAKE_CLOSED' }, 503, origin);
    }
    if (
      !request.headers
        .get('content-type')
        ?.toLowerCase()
        .startsWith('application/json')
    )
      return json({ ok: false, error: 'CONTENT_TYPE_REQUIRED' }, 415, origin);
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > 16000)
      return json({ ok: false, error: 'BODY_TOO_LARGE' }, 413, origin);

    const visitorKey = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const visitorRate = await env.SUBMISSION_RATE_LIMITER.limit({
      key: visitorKey,
    });
    if (!visitorRate.success) {
      logOutcome('rejected', { reason: 'visitor_rate' });
      return json({ ok: false, error: 'RATE_LIMITED' }, 429, origin);
    }

    let payload;
    try {
      payload = await readJsonBody(request, 16000);
    } catch (error) {
      const code = error.message === 'BODY_TOO_LARGE' ? 413 : 400;
      return json({ ok: false, error: error.message }, code, origin);
    }
    const invalid = validateSubmission(payload);
    if (invalid) {
      logOutcome('rejected', { reason: 'validation' });
      return json({ ok: false, error: invalid }, 400, origin);
    }

    let challenge;
    try {
      const verification = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          body: new URLSearchParams({
            secret: env.TURNSTILE_SECRET_KEY,
            response: payload.turnstileToken,
            remoteip: visitorKey,
            idempotency_key: payload.requestId,
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
      challenge = await verification.json();
    } catch {
      logOutcome('unavailable', { reason: 'challenge' });
      return json({ ok: false, error: 'CHALLENGE_UNAVAILABLE' }, 503, origin);
    }
    if (
      !challenge.success ||
      challenge.hostname !== allowedHostname ||
      challenge.action !== expectedChallengeAction
    ) {
      logOutcome('rejected', { reason: 'challenge' });
      return json({ ok: false, error: 'CHALLENGE_FAILED' }, 403, origin);
    }

    const globalRate = await env.SUBMISSION_GLOBAL_LIMITER.limit({
      key: 'public-intake',
    });
    if (!globalRate.success) {
      logOutcome('rejected', { reason: 'global_rate' });
      return json({ ok: false, error: 'INTAKE_BUSY' }, 429, origin);
    }

    const now = new Date();
    let withinBudget;
    try {
      withinBudget = await checkActionBudget(env, now);
    } catch {
      logOutcome('unavailable', { reason: 'budget_check' });
      return json({ ok: false, error: 'INTAKE_UNAVAILABLE' }, 503, origin);
    }
    if (!withinBudget) {
      logOutcome('rejected', { reason: 'action_budget' });
      return json({ ok: false, error: 'INTAKE_BUSY' }, 429, origin);
    }

    const sourceUrl = sanitizeText(payload.sourceUrl, 2049)
      ? normalizePublicSourceUrl(payload.sourceUrl, { rejectPrivate: true })
      : null;
    const fingerprint = await submissionFingerprint(payload);
    try {
      if (
        await isAlreadyPending(
          env,
          sourceUrl,
          payload.probeId,
          fingerprint,
        )
      ) {
        logOutcome('duplicate');
        return json(
          { ok: true, state: 'ALREADY_UNDER_REVIEW', receiptId: null },
          202,
          origin,
        );
      }
    } catch {
      logOutcome('unavailable', { reason: 'dedupe_check' });
      return json({ ok: false, error: 'INTAKE_UNAVAILABLE' }, 503, origin);
    }

    const receipt = receiptId();
    const submission = {
      formSchemaVersion,
      requestId: payload.requestId,
      receiptId: receipt,
      intakeState: 'NEEDS_REVIEW',
      catalogSchemaVersion: payload.catalogSchemaVersion,
      catalogCheckedThrough: payload.catalogCheckedThrough,
      submissionType: payload.submissionType,
      vendorMode: payload.vendorMode,
      vendorId: sanitizeText(payload.vendorId, 120),
      vendor: sanitizeText(payload.vendor, 80),
      modelMode: payload.modelMode,
      modelId: sanitizeText(payload.modelId, 120),
      model: sanitizeText(payload.model, 120),
      productSurface: sanitizeText(payload.productSurface, 160),
      probeId: payload.probeId,
      sourceUrl,
      submissionFingerprint: fingerprint,
      observedOn: payload.observedOn,
      summary: sanitizeText(payload.summary, 1800),
      expectedBehavior: sanitizeText(payload.expectedBehavior, 1200),
      actualBehavior: sanitizeText(payload.actualBehavior, 1200),
      reproductionSteps: sanitizeText(payload.reproductionSteps, 1800),
      relationship: payload.relationship,
      comments: sanitizeText(payload.comments, 1200),
      publicName: payload.attributionConsent
        ? sanitizeText(payload.publicName, 100)
        : '',
      affiliation: payload.attributionConsent
        ? sanitizeText(payload.affiliation, 120)
        : '',
      attributionConsent: payload.attributionConsent,
      receivedAt: now.toISOString(),
    };

    let dispatch;
    try {
      dispatch = await fetch(
        `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/dispatches`,
        {
          method: 'POST',
          headers: {
            ...repositoryHeaders(env),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            event_type: 'public-evidence-submission',
            client_payload: submission,
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
    } catch {
      logOutcome('unavailable', { reason: 'queue' });
      return json({ ok: false, error: 'QUEUE_UNAVAILABLE' }, 503, origin);
    }
    if (!dispatch.ok) {
      logOutcome('unavailable', { reason: 'queue' });
      return json({ ok: false, error: 'QUEUE_UNAVAILABLE' }, 503, origin);
    }
    logOutcome('accepted', { receiptId: receipt });
    return json(
      { ok: true, state: 'QUEUED_FOR_REVIEW', receiptId: receipt },
      202,
      origin,
    );
  },
};

export default intakeWorker;
