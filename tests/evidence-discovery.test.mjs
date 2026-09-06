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
import intakeWorker, { validateSubmission } from '../worker/intake.mjs';

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
    title: 'Wrong current date',
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
  assert.equal(normalizeUrl(input.sourceUrl), 'https://example.com/report');
  assert.deepEqual(dedupeCandidates([one, two]), [one]);
  assert.deepEqual(
    dedupeCandidates([one], new Set(), new Set([one.source_url])),
    [],
  );
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
  assert.ok(
    buildCandidate({
      ...shared,
      title: 'Model relies on stale memory',
      excerpt:
        'The assistant stated an old answer from stale memory without verifying current evidence.',
    }),
  );
});

test('public intake rejects bots, private-network URLs and weak reports', () => {
  const valid = {
    submissionType: 'FOUND_SOURCE',
    vendor: 'Anthropic',
    model: 'Fable 5',
    productSurface: 'Claude Code session',
    probeId: 'probe-elapsed',
    sourceUrl: 'https://example.com/report',
    observedOn: '2026-09-06',
    summary: 'A detailed public report of elapsed-time behavior.',
    relationship: 'NONE',
    attributionConsent: false,
    website: '',
    turnstileToken: 'token',
  };
  assert.equal(validateSubmission(valid), null);
  assert.equal(
    validateSubmission({ ...valid, website: 'spam' }),
    'BOT_FIELD_FILLED',
  );
  assert.equal(
    validateSubmission({ ...valid, sourceUrl: 'https://127.0.0.1/private' }),
    'INVALID_SOURCE_URL',
  );
  assert.equal(
    validateSubmission({ ...valid, summary: 'too short' }),
    'INVALID_SUMMARY',
  );
});

test('public intake requires the canonical Turnstile hostname and action', async () => {
  const payload = {
    submissionType: 'FOUND_SOURCE',
    vendor: 'Anthropic',
    model: 'Fable 5',
    productSurface: 'Claude Code session',
    probeId: 'probe-elapsed',
    sourceUrl: 'https://example.com/report',
    observedOn: '2026-09-06',
    summary: 'A detailed public report of elapsed-time behavior.',
    relationship: 'NONE',
    attributionConsent: false,
    website: '',
    turnstileToken: 'token',
  };
  const env = {
    TURNSTILE_SECRET_KEY: 'test-secret',
    GITHUB_REPOSITORY_TOKEN: 'test-token',
    GITHUB_REPOSITORY: 'diegolinan/eternal-tuesday-monitor',
    SUBMISSION_RATE_LIMITER: { limit: async () => ({ success: true }) },
  };
  const originalFetch = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1)
        return Response.json({
          success: true,
          hostname: 'diegolinan.github.io',
          action: 'evidence_submission',
        });
      return new Response(null, { status: 204 });
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
    assert.equal(calls, 2);

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
