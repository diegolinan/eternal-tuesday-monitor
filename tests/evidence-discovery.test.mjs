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
import { validateSubmission } from '../worker/intake.mjs';

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
