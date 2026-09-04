import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateObservationFreshness } from '../scripts/lib/freshness.mjs';

const policy = {
  rules: [{ evidence_class_id: 'evidence-test', max_age_days: 30 }],
};
const base = {
  observation: {
    id: 'obs-test',
    model_id: 'model-test',
    surface_id: 'surface-test',
    methodology_version_id: 'method-test',
    evidence_class_id: 'evidence-test',
    last_verified_on: '2026-09-01',
    result_status_id: 'OBSERVED_FAILURE',
    record_states: ['CURRENT'],
  },
  evidenceRecord: { id: 'evidence-record-test' },
  sourceIds: ['source-test'],
  policy,
  events: [],
};

test('evidence is sufficient through the inclusive age boundary', () => {
  const result = evaluateObservationFreshness({ ...base, asOf: '2026-10-01' });
  assert.equal(result.currentSufficiency, 'SUFFICIENT');
  assert.equal(result.ageDays, 30);
});

test('evidence requires a retest after the age boundary', () => {
  const result = evaluateObservationFreshness({ ...base, asOf: '2026-10-02' });
  assert.equal(result.currentSufficiency, 'RETEST_REQUIRED');
  assert.deepEqual(result.sufficiencyReasons, ['AGE_THRESHOLD_EXCEEDED']);
});

test('freshness evaluation never changes the observed result', () => {
  const before = structuredClone(base.observation);
  evaluateObservationFreshness({ ...base, asOf: '2026-10-02' });
  assert.deepEqual(base.observation, before);
  assert.equal(base.observation.result_status_id, 'OBSERVED_FAILURE');
});

test('a superseded model requires a retest', () => {
  const result = evaluateObservationFreshness({
    ...base,
    asOf: '2026-09-07',
    events: [
      {
        id: 'event-model',
        subject_type: 'model',
        subject_id: 'model-test',
        event_type: 'SUPERSEDED',
        effective_on: '2026-09-06',
        recorded_on: '2026-09-06',
        reason: 'Fixture lifecycle change.',
      },
    ],
  });
  assert.equal(result.currentSufficiency, 'RETEST_REQUIRED');
  assert.ok(result.sufficiencyReasons.includes('MODEL_SUPERSEDED'));
});

test('source availability follows the latest applicable source event', () => {
  const observedResult = base.observation.result_status_id;
  const result = evaluateObservationFreshness({
    ...base,
    asOf: '2026-09-07',
    events: [
      {
        id: 'event-source',
        subject_type: 'source',
        subject_id: 'source-test',
        event_type: 'SOURCE_UNAVAILABLE',
        effective_on: '2026-09-06',
        recorded_on: '2026-09-06',
        reason: 'Fixture source outage.',
      },
    ],
  });
  assert.equal(result.sourceAvailability, 'UNAVAILABLE');
  assert.ok(result.sufficiencyReasons.includes('SOURCE_UNAVAILABLE'));
  assert.equal(base.observation.result_status_id, observedResult);
});
