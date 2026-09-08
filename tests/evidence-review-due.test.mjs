import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEvidenceReviewIssue,
  collectEvidenceReviewsDue,
  evidenceReviewMarker,
  readEvidenceReviewMarker,
} from '../scripts/notifications/evidence-review-due.mjs';

const monitor = {
  freshnessEvaluatedOn: '2026-09-08',
  observations: [
    {
      id: 'obs-current',
      currentSufficiency: 'SUFFICIENT',
      vendor: 'OpenAI',
    },
    {
      id: 'obs-retest-b',
      currentSufficiency: 'RETEST_REQUIRED',
      vendor: 'Vendor B',
      product: 'Product B',
      surface: 'Desktop',
      model: 'Model B',
      probe: 'ELAPSED',
      applicability: 'HISTORICAL',
      evidenceVerifiedOn: '2026-09-03',
      sufficiencyReasons: ['LEGACY_RETEST_REQUIRED'],
    },
    {
      id: 'obs-retest-a',
      currentSufficiency: 'RETEST_REQUIRED',
      vendor: 'Vendor A',
      product: 'Product A',
      surface: 'API',
      model: 'Model A',
      probe: 'REVALIDATION',
      applicability: 'CURRENT',
      evidenceVerifiedOn: '2026-08-01',
      sufficiencyReasons: ['AGE_THRESHOLD_EXCEEDED'],
    },
  ],
};

test('due-review collection is deterministic and limited to retest state', () => {
  const due = collectEvidenceReviewsDue(monitor);
  assert.deepEqual(
    due.map((item) => item.id),
    ['obs-retest-a', 'obs-retest-b'],
  );
  assert.equal(
    evidenceReviewMarker(due),
    '<!-- etm-evidence-review-due:obs-retest-a,obs-retest-b -->',
  );
  assert.deepEqual(readEvidenceReviewMarker(evidenceReviewMarker(due)), [
    'obs-retest-a',
    'obs-retest-b',
  ]);
});

test('the reminder makes its non-evidentiary scope explicit', () => {
  const due = collectEvidenceReviewsDue(monitor);
  const body = buildEvidenceReviewIssue(monitor, due);
  assert.match(body, /Freshness evaluated on: \*\*2026-09-08\*\*/);
  assert.match(body, /obs-retest-a/);
  assert.match(body, /Evidence exceeded its review window/);
  assert.match(body, /did not run a behavioral probe/);
  assert.match(body, /create a PASS or FAIL/);
  assert.match(body, /change an observation/);
});
