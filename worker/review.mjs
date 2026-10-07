import {
  closeReviewPull,
  dispatchCandidateReview,
  getReviewPull,
  listOpenReviewPulls,
  mergeReviewPull,
  readLedger,
  validateReviewPull,
} from './review-github.mjs';
import { reviewHtml, reviewCss, reviewJs } from './review-ui.mjs';

const decisions = new Set([
  'REJECTED_IRRELEVANT',
  'REJECTED_UNVERIFIABLE',
  'DUPLICATE',
  'NEEDS_MORE_INFORMATION',
  'ACCEPTED_AS_SUPPORTING_SOURCE',
  'REQUIRES_BEHAVIORAL_REPRODUCTION',
]);

const securityHeaders = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...securityHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

const asset = (body, type) =>
  new Response(body, {
    headers: { ...securityHeaders, 'Content-Type': `${type}; charset=utf-8` },
  });

const isEmailAllowed = (email, env) =>
  String(env.REVIEWER_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(String(email ?? '').toLowerCase());

async function reviewerIdentity(ctx, env) {
  if (
    !ctx?.access ||
    !env.REVIEW_ACCESS_AUD ||
    ctx.access.aud !== env.REVIEW_ACCESS_AUD
  ) {
    return null;
  }
  try {
    const identity = await ctx.access.getIdentity();
    return isEmailAllowed(identity?.email, env)
      ? identity.email.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

async function parseBody(request) {
  if (
    !request.headers
      .get('Content-Type')
      ?.toLowerCase()
      .startsWith('application/json')
  ) {
    throw new Error('INVALID_CONTENT_TYPE');
  }
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (length > 4096) throw new Error('BODY_TOO_LARGE');
  const body = await request.text();
  if (new TextEncoder().encode(body).length > 4096)
    throw new Error('BODY_TOO_LARGE');
  try {
    const result = JSON.parse(body);
    if (!result || typeof result !== 'object' || Array.isArray(result))
      throw new Error();
    return result;
  } catch {
    throw new Error('INVALID_JSON');
  }
}

const isSafePost = (request) => {
  const origin = request.headers.get('Origin');
  return origin !== null && origin === new URL(request.url).origin;
};

const errorStatus = (code) => {
  if (code === 'GITHUB_APP_NOT_CONFIGURED' || code === 'GITHUB_APP_AUTH_FAILED')
    return 503;
  if (code === 'GITHUB_UNAVAILABLE' || code === 'GITHUB_CONTENT_UNAVAILABLE')
    return 502;
  if (code === 'GITHUB_NOT_FOUND' || code === 'UNKNOWN_CANDIDATE') return 404;
  if (
    code === 'GITHUB_CONFLICT' ||
    code === 'PROPOSAL_CHANGED' ||
    code === 'PROPOSAL_NOT_READY' ||
    code === 'VALIDATION_NOT_PASSED' ||
    code === 'VALIDATION_ALREADY_RUNNING' ||
    code === 'DECISION_ALREADY_PENDING' ||
    code === 'CANDIDATE_ALREADY_REVIEWED'
  )
    return 409;
  return 400;
};

export const reviewWorker = {
  async fetch(request, env, ctx) {
    const email = await reviewerIdentity(ctx, env);
    if (!email) return json({ error: 'PRIVATE_ACCESS_REQUIRED' }, 403);

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/')
      return asset(reviewHtml, 'text/html');
    if (request.method === 'GET' && url.pathname === '/review.css')
      return asset(reviewCss, 'text/css');
    if (request.method === 'GET' && url.pathname === '/review.js')
      return asset(reviewJs, 'application/javascript');
    if (request.method === 'GET' && url.pathname === '/api/session') {
      return json({
        reviewer: email,
        writeEnabled: env.REVIEW_WRITE_ENABLED === 'true',
      });
    }

    try {
      if (request.method === 'GET' && url.pathname === '/api/inbox') {
        const items = await listOpenReviewPulls(env);
        return json({ items });
      }
      if (request.method === 'GET' && url.pathname === '/api/candidates') {
        const [candidates, reviews, batchDecisions] = await Promise.all([
          readLedger(env, 'data/evidence-discovery/candidates.jsonl'),
          readLedger(env, 'data/evidence-discovery/reviews.jsonl'),
          readLedger(env, 'data/evidence-discovery/decisions.jsonl'),
        ]);
        const superseded = new Set(
          reviews.map((entry) => entry.supersedes_review_id).filter(Boolean),
        );
        const reviewed = new Set(
          reviews
            .filter((entry) => !superseded.has(entry.id))
            .map((entry) => entry.candidate_id),
        );
        const retracted = new Set(
          batchDecisions
            .filter((entry) => entry.decision === 'RETRACTED_PIPELINE_DEFECT')
            .map((entry) => entry.candidate_batch_generated_at),
        );
        return json({
          items: candidates
            .filter(
              (entry) =>
                !reviewed.has(entry.id) && !retracted.has(entry.discovered_at),
            )
            .map((entry) => ({
              id: entry.id,
              title: entry.source_title ?? entry.summary ?? 'Untitled lead',
              excerpt: entry.source_excerpt ?? '',
              sourceUrl: entry.source_url ?? null,
              sourceType: entry.source_type,
              publishedOn: entry.published_on ?? null,
              discoveredAt: entry.discovered_at,
              probes: entry.probe_ids ?? [],
              modelIds: entry.model_ids ?? [],
              productIds: entry.product_ids ?? [],
              claimClass: entry.claim_class ?? null,
            }))
            .slice(-250)
            .reverse(),
        });
      }
      const prMatch = url.pathname.match(/^\/api\/pulls\/(\d+)$/);
      if (request.method === 'GET' && prMatch) {
        return json(await getReviewPull(env, Number(prMatch[1])));
      }

      if (request.method === 'POST') {
        if (!isSafePost(request))
          return json({ error: 'CROSS_ORIGIN_REQUEST' }, 403);
        if (env.REVIEW_WRITE_ENABLED !== 'true')
          return json({ error: 'REVIEW_WRITES_DISABLED' }, 503);
        const body = await parseBody(request);
        const actionMatch = url.pathname.match(
          /^\/api\/pulls\/(\d+)\/(validate|merge|close)$/,
        );
        if (actionMatch) {
          const number = Number(actionMatch[1]);
          if (!Number.isSafeInteger(number) || number < 1)
            throw new Error('INVALID_PULL_NUMBER');
          if (!/^[a-f0-9]{40}$/.test(body.headSha ?? ''))
            throw new Error('INVALID_HEAD_SHA');
          if (actionMatch[2] === 'validate') {
            return json(await validateReviewPull(env, number, body.headSha));
          }
          if (actionMatch[2] === 'merge') {
            return json(await mergeReviewPull(env, number, body.headSha));
          }
          return json(
            await closeReviewPull(
              env,
              number,
              body.headSha,
              body.reason,
              email,
            ),
          );
        }
        const candidateMatch = url.pathname.match(
          /^\/api\/candidates\/(evcand-[a-f0-9]{24})\/decide$/,
        );
        if (candidateMatch) {
          if (!decisions.has(body.decision))
            throw new Error('INVALID_DECISION');
          const reason = String(body.reason ?? '').trim();
          if (reason.length < 20 || reason.length > 1200)
            throw new Error('INVALID_REASON');
          return json(
            await dispatchCandidateReview(
              env,
              candidateMatch[1],
              body.decision,
              reason,
              email,
            ),
          );
        }
      }
      return json({ error: 'NOT_FOUND' }, 404);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      const known = /^[A-Z_]+$/.test(code) ? code : 'UNKNOWN_ERROR';
      return json({ error: known }, errorStatus(known));
    }
  },
};

export default reviewWorker;
