import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  buildCandidate,
  dedupeCandidates,
  normalizeUrl,
} from '../scripts/evidence-discovery/core.mjs';
import {
  activeCandidateReviews,
  buildCandidateReview,
} from '../scripts/evidence-discovery/review.mjs';
import intakeWorker, {
  sanitizeText,
  submissionDedupeKey,
  validateSubmission,
} from '../worker/intake.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('known historical records exercise every Monitor probe, including Fable', async () => {
  const fixtures = JSON.parse(
    await readFile(
      path.join(root, 'tests/fixtures/evidence-benchmark.json'),
      'utf8',
    ),
  );
  const covered = new Set();
  for (const [index, fixture] of fixtures.entries()) {
    const sourceType =
      fixture.expectedClaim === 'OFFICIAL_CAPABILITY_CLAIM'
        ? 'OFFICIAL_SOURCE'
        : fixture.expectedClaim === 'RESEARCH_RESULT'
          ? 'RESEARCH_INDEX'
          : 'PUBLIC_ISSUE';
    const candidate = buildCandidate({
      sourceType,
      sourceUrl: fixture.url,
      title: fixture.name,
      excerpt: fixture.text,
      discoveredAt: `2026-09-06T12:00:0${index}.000Z`,
      queryId: 'benchmark',
    });
    assert.ok(candidate, fixture.name);
    assert.ok(
      candidate.probe_ids.includes(fixture.expectedProbe),
      fixture.name,
    );
    assert.equal(candidate.claim_class, fixture.expectedClaim, fixture.name);
    assert.equal(candidate.review_state, 'PENDING');
    assert.doesNotMatch(
      JSON.stringify(candidate),
      /"(?:result|verdict)":"(?:PASS|FAIL)"/,
    );
    covered.add(fixture.expectedProbe);
  }
  assert.equal(covered.size, 5);
  assert.equal(fixtures[0].name.includes('Fable 5'), true);
});

test('candidate identity is stable and accepted URLs are excluded', () => {
  const input = {
    sourceType: 'PUBLIC_ISSUE',
    sourceUrl: 'https://example.com/report?utm_source=x#part',
    title: 'Agent reports wrong current date',
    excerpt: 'The agent reports the wrong current date.',
    discoveredAt: '2026-09-06T12:00:00.000Z',
    queryId: 'test',
  };
  const one = buildCandidate(input);
  const two = buildCandidate({
    ...input,
    discoveredAt: '2026-09-07T12:00:00.000Z',
  });
  assert.equal(one.id, two.id);
  assert.notEqual(
    one.id,
    buildCandidate({
      ...input,
      screeningPolicyVersion: 'ETM-EVIDENCE-9.9',
    }).id,
  );
  assert.equal(normalizeUrl(input.sourceUrl), 'https://example.com/report');
  assert.equal(
    normalizeUrl(
      'https://EXAMPLE.com/report/?utm_source=x&utm_medium=y&b=2&a=1#part',
    ),
    'https://example.com/report?a=1&b=2',
  );
  assert.deepEqual(dedupeCandidates([one, two]), [one]);
  assert.deepEqual(
    dedupeCandidates([one], new Set(), new Set([one.source_url])),
    [],
  );
});

test('a firsthand report can remain a reproducible lead without inventing a source URL', () => {
  const fingerprint = 'a'.repeat(64);
  const candidate = buildCandidate({
    sourceType: 'PUBLIC_SUBMISSION',
    sourceUrl: '',
    identityKey: fingerprint,
    submissionFingerprint: fingerprint,
    title: 'Firsthand temporal anchor report',
    excerpt: 'The assistant stated the wrong current date in a new session.',
    discoveredAt: '2026-09-07T12:00:00.000Z',
    queryId: 'public-intake',
    probeIds: ['probe-temporal-anchor'],
    claimClass: 'PRACTITIONER_REPORT',
    allowUnclassified: true,
  });
  assert.equal(candidate.source_url, null);
  assert.equal(candidate.submission_fingerprint, fingerprint);
  assert.equal(candidate.source_title, 'Firsthand temporal anchor report');
  assert.match(candidate.review_reasons.join(' '), /reproduce it/i);
});

test('candidate review decisions are append-only and have one active head', () => {
  const candidate = {
    id: 'evcand-1234567890abcdef12345678',
    discovered_at: '2026-09-07T10:00:00.000Z',
  };
  const first = buildCandidateReview({
    candidate,
    decision: 'NEEDS_MORE_INFORMATION',
    reason: 'The report lacks an exact product surface and reproducible steps.',
    reviewer: 'diegolinan',
    decidedAt: '2026-09-07T11:00:00.000Z',
  });
  const corrected = buildCandidateReview({
    candidate,
    decision: 'REQUIRES_BEHAVIORAL_REPRODUCTION',
    reason:
      'The clarified report is relevant but needs independent reproduction.',
    reviewer: 'diegolinan',
    decidedAt: '2026-09-07T12:00:00.000Z',
    supersedesReviewId: first.id,
    reviews: [first],
  });
  assert.deepEqual(activeCandidateReviews([first, corrected], candidate.id), [
    corrected,
  ]);
  assert.throws(
    () =>
      buildCandidateReview({
        candidate,
        decision: 'ACCEPTED_AS_SUPPORTING_SOURCE',
        reason: 'This would incorrectly fork the active review history.',
        reviewer: 'diegolinan',
        decidedAt: '2026-09-07T13:00:00.000Z',
        reviews: [first, corrected],
      }),
    /ACTIVE_REVIEW_ALREADY_EXISTS/,
  );
});

test('intake dedupe keys separate public URLs from firsthand content', async () => {
  const fingerprint = 'a'.repeat(64);
  const publicOne = await submissionDedupeKey(
    'https://example.com/report',
    'probe-elapsed',
    fingerprint,
  );
  const publicTwo = await submissionDedupeKey(
    'https://example.com/report',
    'probe-elapsed',
    'b'.repeat(64),
  );
  const firsthand = await submissionDedupeKey(
    null,
    'probe-elapsed',
    fingerprint,
  );
  assert.equal(publicOne, publicTwo);
  assert.notEqual(publicOne, firsthand);
});

test('public screening rejects UI and infrastructure keyword collisions', () => {
  const shared = {
    sourceType: 'PUBLIC_ISSUE',
    sourceUrl: 'https://example.com/report',
    discoveredAt: '2026-09-06T12:00:00.000Z',
    queryId: 'regression',
  };
  assert.equal(
    buildCandidate({
      ...shared,
      title: 'Claude elapsed timer freezes',
      excerpt: 'The session spinner stops painting its elapsed counter.',
    }),
    null,
  );
  assert.equal(
    buildCandidate({
      ...shared,
      title: 'Claude model quality regression',
      excerpt:
        'The report compares verbosity between sessions across model generations.',
    }),
    null,
  );
  assert.equal(
    buildCandidate({
      ...shared,
      title: 'Claude session shows a stale project name',
      excerpt: 'The desktop breadcrumb keeps the stale project label.',
    }),
    null,
  );
  assert.equal(
    buildCandidate({
      ...shared,
      title: 'Claude usage reset timer changed yesterday',
      excerpt:
        'The session usage counter moved after yesterday without resetting.',
    }),
    null,
  );
  assert.equal(
    buildCandidate({
      ...shared,
      title: 'Claude project folder lost prior session history',
      excerpt:
        'Renaming the folder hides the prior session from the project list.',
    }),
    null,
  );
  assert.equal(
    buildCandidate({
      ...shared,
      title: 'Claude auto memory contains stale memory',
      excerpt:
        'The session loads a stale memory file but reports no model behavior.',
    }),
    null,
  );
  assert.equal(
    buildCandidate({
      ...shared,
      title: 'Cowork was working yesterday and is now missing',
      excerpt:
        'The Claude session report says the product disappeared after an update.',
    }),
    null,
  );
  assert.equal(
    buildCandidate({
      ...shared,
      title: 'Connector stopped working yesterday morning',
      excerpt: 'The Claude session report says a connected tool disappeared.',
    }),
    null,
  );
  assert.equal(
    buildCandidate({
      ...shared,
      title: 'Auto memory has no freshness indicator',
      excerpt:
        'A months-old stale memory file loads into every Claude session.',
    }),
    null,
  );
  assert.equal(
    buildCandidate({
      ...shared,
      title: 'Sessions with model show no messages after update',
      excerpt:
        'Historical context still exists on disk but the Claude session list is empty.',
    }),
    null,
  );
  assert.ok(
    buildCandidate({
      ...shared,
      title: 'Model relies on stale memory',
      excerpt:
        'The assistant stated an old answer from stale memory without verifying current evidence.',
    }),
  );
  assert.ok(
    buildCandidate({
      ...shared,
      title: 'Claude said good night after an eight-hour resumed-session gap',
      excerpt:
        'The assistant said good night when the user had just woken up and referenced the test from hours earlier as still running.',
    }),
  );
});

test('public intake rejects bots, private-network URLs and weak reports', () => {
  const valid = {
    formSchemaVersion: '2.1.0',
    requestId: '123e4567-e89b-42d3-a456-426614174000',
    catalogSchemaVersion: '2.0.0',
    catalogCheckedThrough: '2026-09-05',
    submissionType: 'FOUND_SOURCE',
    vendorMode: 'CATALOG',
    vendorId: 'vendor-anthropic',
    vendor: 'Anthropic',
    modelMode: 'CATALOG',
    modelId: 'model-fable-5',
    model: 'Fable 5',
    productSurface: 'Claude Code session',
    probeId: 'probe-elapsed',
    sourceUrl: 'https://example.com/report',
    observedOn: '2026-09-06',
    summary: 'A detailed public report of elapsed-time behavior.',
    expectedBehavior: '',
    actualBehavior: '',
    reproductionSteps: '',
    relationship: 'NONE',
    comments: '',
    publicName: '',
    affiliation: '',
    attributionConsent: false,
    website: '',
    turnstileToken: 'token',
  };
  assert.equal(
    validateSubmission(valid, new Date('2026-09-07T00:00:00Z')),
    null,
  );
  assert.equal(
    validateSubmission({ ...valid, website: 'spam' }),
    'BOT_FIELD_FILLED',
  );
  assert.equal(
    validateSubmission({ ...valid, sourceUrl: 'https://127.0.0.1/private' }),
    'INVALID_SOURCE_URL',
  );
  assert.equal(
    validateSubmission({ ...valid, sourceUrl: '' }),
    'INVALID_SOURCE_URL',
  );
  assert.equal(
    validateSubmission({ ...valid, summary: 'too short' }),
    'INVALID_SUMMARY',
  );
  assert.equal(
    validateSubmission(
      { ...valid, observedOn: '2026-09-08' },
      new Date('2026-09-07T00:00:00Z'),
    ),
    'INVALID_DATE',
  );
  assert.equal(
    validateSubmission({ ...valid, observedOn: '2026-02-30' }),
    'INVALID_DATE',
  );
  assert.equal(
    validateSubmission({
      ...valid,
      submissionType: 'FIRSTHAND_OBSERVATION',
      sourceUrl: '',
      expectedBehavior: 'Expected behavior is clear.',
      actualBehavior: 'Actual behavior is clear.',
      reproductionSteps: 'Repeat these clear steps twice.',
    }),
    null,
  );
  assert.equal(sanitizeText('safe\u202Etxt\u0000', 20), 'safetxt');
});

test('public intake requires the canonical Turnstile hostname and action', async () => {
  const payload = {
    formSchemaVersion: '2.1.0',
    requestId: '123e4567-e89b-42d3-a456-426614174000',
    catalogSchemaVersion: '2.0.0',
    catalogCheckedThrough: '2026-09-05',
    submissionType: 'FOUND_SOURCE',
    vendorMode: 'CATALOG',
    vendorId: 'vendor-anthropic',
    vendor: 'Anthropic',
    modelMode: 'CATALOG',
    modelId: 'model-fable-5',
    model: 'Fable 5',
    productSurface: 'Claude Code session',
    probeId: 'probe-elapsed',
    sourceUrl: 'https://example.com/report',
    observedOn: '2026-09-06',
    summary: 'A detailed public report of elapsed-time behavior.',
    expectedBehavior: '',
    actualBehavior: '',
    reproductionSteps: '',
    relationship: 'NONE',
    comments: '',
    publicName: '',
    affiliation: '',
    attributionConsent: false,
    website: '',
    turnstileToken: 'token',
  };
  const env = {
    TURNSTILE_SECRET_KEY: 'test-secret',
    GITHUB_REPOSITORY_TOKEN: 'test-token',
    GITHUB_REPOSITORY: 'diegolinan/eternal-tuesday-monitor',
    INTAKE_OPEN: 'true',
    INTAKE_HOURLY_BUDGET: '12',
    INTAKE_DAILY_BUDGET: '40',
    SUBMISSION_RATE_LIMITER: { limit: async () => ({ success: true }) },
    SUBMISSION_GLOBAL_LIMITER: { limit: async () => ({ success: true }) },
  };
  const originalFetch = globalThis.fetch;
  try {
    const calls = [];
    globalThis.fetch = async (input) => {
      const url =
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : input;
      calls.push(url);
      if (url.includes('siteverify'))
        return Response.json({
          success: true,
          hostname: 'diegolinan.github.io',
          action: 'evidence_submission',
        });
      if (url.includes('/actions/workflows/'))
        return Response.json({ workflow_runs: [] });
      if (url.includes('/contents/'))
        return Response.json({ encoding: 'base64', content: btoa('') });
      if (url.includes('/search/issues'))
        return Response.json({ total_count: 0, items: [] });
      if (url.endsWith('/dispatches'))
        return new Response(null, { status: 204 });
      throw new Error(`Unexpected fetch: ${url}`);
    };
    const accepted = await intakeWorker.fetch(
      new Request('https://intake.example/', {
        method: 'POST',
        headers: {
          Origin: 'https://diegolinan.github.io',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }),
      env,
    );
    assert.equal(accepted.status, 202);
    assert.equal(calls.length, 5);
    const acceptedBody = await accepted.json();
    assert.match(acceptedBody.receiptId, /^ETM-LEAD-/);

    globalThis.fetch = async () =>
      Response.json({
        success: true,
        hostname: 'example.com',
        action: 'evidence_submission',
      });
    const rejected = await intakeWorker.fetch(
      new Request('https://intake.example/', {
        method: 'POST',
        headers: {
          Origin: 'https://diegolinan.github.io',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }),
      env,
    );
    assert.equal(rejected.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('public intake closes safely and suppresses duplicate dispatches', async () => {
  const payload = {
    formSchemaVersion: '2.1.0',
    requestId: '123e4567-e89b-42d3-a456-426614174000',
    catalogSchemaVersion: '2.0.0',
    catalogCheckedThrough: '2026-09-05',
    submissionType: 'FOUND_SOURCE',
    vendorMode: 'CATALOG',
    vendorId: 'vendor-anthropic',
    vendor: 'Anthropic',
    modelMode: 'CATALOG',
    modelId: 'model-fable-5',
    model: 'Fable 5',
    productSurface: 'Claude Code session',
    probeId: 'probe-elapsed',
    sourceUrl: 'https://example.com/report?utm_source=test',
    observedOn: '2026-09-06',
    summary: 'A detailed public report of elapsed-time behavior.',
    expectedBehavior: '',
    actualBehavior: '',
    reproductionSteps: '',
    relationship: 'NONE',
    comments: '',
    publicName: '',
    affiliation: '',
    attributionConsent: false,
    website: '',
    turnstileToken: 'token',
  };
  const baseEnv = {
    TURNSTILE_SECRET_KEY: 'test-secret',
    GITHUB_REPOSITORY_TOKEN: 'test-token',
    GITHUB_REPOSITORY: 'diegolinan/eternal-tuesday-monitor',
    INTAKE_OPEN: 'true',
    INTAKE_HOURLY_BUDGET: '12',
    INTAKE_DAILY_BUDGET: '40',
    SUBMISSION_RATE_LIMITER: { limit: async () => ({ success: true }) },
    SUBMISSION_GLOBAL_LIMITER: { limit: async () => ({ success: true }) },
  };
  const makeRequest = () =>
    new Request('https://intake.example/', {
      method: 'POST',
      headers: {
        Origin: 'https://diegolinan.github.io',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  const closed = await intakeWorker.fetch(makeRequest(), {
    ...baseEnv,
    INTAKE_OPEN: 'false',
  });
  assert.equal(closed.status, 503);

  const originalFetch = globalThis.fetch;
  try {
    let dispatched = false;
    globalThis.fetch = async (input) => {
      const url =
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : input;
      if (url.includes('siteverify'))
        return Response.json({
          success: true,
          hostname: 'diegolinan.github.io',
          action: 'evidence_submission',
        });
      if (url.includes('/actions/workflows/'))
        return Response.json({ workflow_runs: [] });
      if (url.includes('/contents/'))
        return Response.json({
          encoding: 'base64',
          content: btoa(
            `${JSON.stringify({
              source_url: 'https://example.com/report',
              probe_ids: ['probe-elapsed'],
            })}\n`,
          ),
        });
      if (url.endsWith('/dispatches')) dispatched = true;
      return new Response(null, { status: 204 });
    };
    const duplicate = await intakeWorker.fetch(makeRequest(), baseEnv);
    assert.equal(duplicate.status, 202);
    assert.equal((await duplicate.json()).state, 'ALREADY_UNDER_REVIEW');
    assert.equal(dispatched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
