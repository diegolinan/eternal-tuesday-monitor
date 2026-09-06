const allowedOrigin = 'https://diegolinan.github.io';
const json = (body, status = 200, origin = allowedOrigin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
    },
  });
const text = (value, max) =>
  String(value ?? '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
const allowedProbeIds = new Set([
  'probe-temporal-anchor',
  'probe-elapsed',
  'probe-revalidation',
  'probe-state-reconciliation',
  'probe-historical-validity',
  'UNSURE',
]);

export function validateSubmission(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return 'INVALID_BODY';
  if (payload.website !== '') return 'BOT_FIELD_FILLED';
  if (
    !['FOUND_SOURCE', 'FIRSTHAND_OBSERVATION'].includes(payload.submissionType)
  )
    return 'INVALID_SUBMISSION_TYPE';
  if (!allowedProbeIds.has(payload.probeId)) return 'INVALID_PROBE';
  if (
    !['NONE', 'USER', 'AUTHOR', 'EMPLOYEE', 'OTHER'].includes(
      payload.relationship,
    )
  )
    return 'INVALID_RELATIONSHIP';
  if (typeof payload.attributionConsent !== 'boolean') return 'INVALID_CONSENT';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.observedOn ?? ''))
    return 'INVALID_DATE';
  if (
    text(payload.summary, 1801).length < 30 ||
    text(payload.summary, 1801).length > 1800
  )
    return 'INVALID_SUMMARY';
  for (const [field, max] of [
    ['vendor', 80],
    ['model', 120],
    ['productSurface', 160],
  ])
    if (
      !text(payload[field], max + 1) ||
      text(payload[field], max + 1).length > max
    )
      return `INVALID_${field.toUpperCase()}`;
  let url;
  try {
    url = new URL(payload.sourceUrl);
  } catch {
    return 'INVALID_SOURCE_URL';
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(url.hostname) ||
    /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url.hostname)
  )
    return 'INVALID_SOURCE_URL';
  if (!text(payload.turnstileToken, 2049)) return 'MISSING_CHALLENGE';
  return null;
}

const intakeWorker = {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (origin !== allowedOrigin)
      return json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, 403);
    if (request.method === 'OPTIONS')
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        },
      });
    if (request.method !== 'POST')
      return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
    if (
      !request.headers
        .get('content-type')
        ?.toLowerCase()
        .startsWith('application/json')
    )
      return json({ ok: false, error: 'CONTENT_TYPE_REQUIRED' }, 415);
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > 16000)
      return json({ ok: false, error: 'BODY_TOO_LARGE' }, 413);
    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ ok: false, error: 'INVALID_JSON' }, 400);
    }
    const invalid = validateSubmission(payload);
    if (invalid) return json({ ok: false, error: invalid }, 400);
    const verification = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: new URLSearchParams({
          secret: env.TURNSTILE_SECRET_KEY,
          response: payload.turnstileToken,
          remoteip: request.headers.get('CF-Connecting-IP') ?? '',
        }),
      },
    );
    const challenge = await verification.json();
    if (!challenge.success)
      return json({ ok: false, error: 'CHALLENGE_FAILED' }, 403);
    const rate = await env.SUBMISSION_RATE_LIMITER.limit({
      key: request.headers.get('CF-Connecting-IP') ?? 'unknown',
    });
    if (!rate.success) return json({ ok: false, error: 'RATE_LIMITED' }, 429);
    const submission = {
      submissionType: payload.submissionType,
      vendor: text(payload.vendor, 80),
      model: text(payload.model, 120),
      productSurface: text(payload.productSurface, 160),
      probeId: payload.probeId,
      sourceUrl: new URL(payload.sourceUrl).href,
      observedOn: payload.observedOn,
      summary: text(payload.summary, 1800),
      expectedBehavior: text(payload.expectedBehavior, 1200),
      actualBehavior: text(payload.actualBehavior, 1200),
      relationship: payload.relationship,
      comments: text(payload.comments, 1200),
      publicName: payload.attributionConsent
        ? text(payload.publicName, 100)
        : '',
      affiliation: payload.attributionConsent
        ? text(payload.affiliation, 120)
        : '',
      attributionConsent: payload.attributionConsent,
      receivedAt: new Date().toISOString(),
    };
    const dispatch = await fetch(
      `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GITHUB_REPOSITORY_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'eternal-tuesday-intake',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          event_type: 'public-evidence-submission',
          client_payload: submission,
        }),
      },
    );
    if (!dispatch.ok)
      return json({ ok: false, error: 'QUEUE_UNAVAILABLE' }, 503);
    return json({ ok: true, state: 'QUEUED_FOR_REVIEW' }, 202);
  },
};

export default intakeWorker;
