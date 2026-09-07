import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertNoOpenEvidenceDecision,
  openEvidenceDecisionPulls,
} from '../scripts/notifications/assert-no-open-evidence-decision.mjs';

test('review lock ignores ordinary issues and identifies decision pull requests', () => {
  assert.deepEqual(
    openEvidenceDecisionPulls([
      { number: 21 },
      { number: 22, pull_request: { url: 'https://example.test/pulls/22' } },
    ]).map(({ number }) => number),
    [22],
  );
});

test('review lock allows a new decision when no decision PR is open', async () => {
  await assertNoOpenEvidenceDecision({
    repository: 'owner/repository',
    token: 'test-token',
    fetchImpl: async () => ({ ok: true, json: async () => [] }),
  });
});

test('review lock names every open decision PR that must be resolved', async () => {
  await assert.rejects(
    assertNoOpenEvidenceDecision({
      repository: 'owner/repository',
      token: 'test-token',
      fetchImpl: async () => ({
        ok: true,
        json: async () => [
          { number: 31, pull_request: {} },
          { number: 32, pull_request: {} },
        ],
      }),
    }),
    /OPEN_EVIDENCE_DECISION_EXISTS:#31, #32/,
  );
});
