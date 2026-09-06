import assert from 'node:assert/strict';
import test from 'node:test';
import { compileModelOperations } from '../lib/model-operations.mjs';

const model = {
  id: 'model-one',
  testabilityState: 'REVIEW_REQUIRED',
  adoptionAssessedOn: '2026-09-05',
  evaluationReasons: ['NO_CURRENT_BEHAVIORAL_EVIDENCE'],
  probeCoverage: [{ id: 'probe-one' }, { id: 'probe-two' }],
};

test('per-model operations distinguish a completed source check from a behavioral run', () => {
  const result = compileModelOperations({
    monitorModels: [model],
    report: {
      models: [
        {
          id: 'model-one',
          provenance: [
            { source_id: 'official-one', url: 'https://example.com/models' },
          ],
          eligibility: {
            state: 'NOT_YET_TESTABLE',
            reasons: ['NO_APPROVED_EXECUTABLE_METHODOLOGY'],
          },
        },
      ],
      source_checks: [
        {
          source_id: 'official-one',
          url: 'https://example.com/models',
          checked_at: '2026-09-06T15:48:30Z',
          result_status: 'OK',
        },
      ],
      events: [],
    },
    completedAt: '2026-09-06T15:51:18Z',
  });

  assert.equal(result.models[0].sourceCheck.state, 'CHECKED_NO_CHANGE');
  assert.equal(result.models[0].sourceCheck.checkedAt, '2026-09-06T15:48:30Z');
  assert.equal(
    result.models[0].eligibilityCheck.checkedAt,
    '2026-09-06T15:51:18Z',
  );
  assert.equal(result.models[0].eligibilityCheck.stateChangedOn, '2026-09-05');
  assert.equal(result.models[0].behavioralEvaluation.state, 'NEVER_RUN');
  assert.equal(result.models[0].behavioralEvaluation.lastAttemptAt, null);
  assert.equal(result.models[0].behavioralEvaluation.evidenceProbes, 0);
});

test('operational failures are attempts, not behavioral evidence', () => {
  const result = compileModelOperations({
    monitorModels: [model],
    report: { models: [], source_checks: [], events: [] },
    evaluationResults: [
      {
        model_id: 'model-one',
        probe_id: 'probe-one',
        executed_at: '2026-09-06T12:00:00Z',
        status: 'OPERATIONAL_ERROR',
      },
    ],
    completedAt: '2026-09-06T15:51:18Z',
  });

  assert.equal(
    result.models[0].behavioralEvaluation.state,
    'OPERATIONAL_ERROR',
  );
  assert.equal(result.models[0].behavioralEvaluation.lastEvidenceAt, null);
  assert.equal(result.models[0].behavioralEvaluation.attemptedProbes, 1);
});

test('accepted observations remain evidence without inventing a five-probe run', () => {
  const result = compileModelOperations({
    monitorModels: [
      {
        ...model,
        probeCoverage: [
          { id: 'probe-one', state: 'TESTED', verifiedOn: '2026-09-05' },
          { id: 'probe-two', state: 'NOT_TESTED', verifiedOn: null },
        ],
      },
    ],
    report: { models: [], source_checks: [], events: [] },
    completedAt: '2026-09-06T15:51:18Z',
  });

  assert.equal(
    result.models[0].behavioralEvaluation.state,
    'EVIDENCE_RECORDED',
  );
  assert.equal(result.models[0].behavioralEvaluation.lastAttemptAt, null);
  assert.equal(
    result.models[0].behavioralEvaluation.lastEvidenceOn,
    '2026-09-05',
  );
  assert.equal(result.models[0].behavioralEvaluation.evidenceProbes, 1);
});
