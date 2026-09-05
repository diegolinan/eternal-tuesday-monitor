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

function event(
  event_type,
  subject_type = 'observation',
  subject_id = 'obs-test',
) {
  return {
    id: `event-${event_type}`,
    event_type,
    subject_type,
    subject_id,
    effective_on: '2026-09-06',
    recorded_on: '2026-09-06',
    reason: 'Test fixture.',
  };
}

test('unknown verification dates never become sufficient or fabricated', () => {
  const observation = { ...base.observation, last_verified_on: null };
  const result = evaluateObservationFreshness({
    ...base,
    observation,
    asOf: '2026-09-07',
  });
  assert.equal(result.ageDays, null);
  assert.equal(result.currentSufficiency, 'RETEST_REQUIRED');
  assert.ok(result.sufficiencyReasons.includes('VERIFICATION_DATE_UNKNOWN'));
  assert.equal(observation.last_verified_on, null);
});

test('an appended successor changes applicability, not the original result', () => {
  const observations = [
    {
      ...base.observation,
      id: 'obs-successor',
      supersedes_observation_id: 'obs-test',
      last_verified_on: '2026-09-08',
    },
  ];
  const before = structuredClone(base.observation);
  assert.equal(
    evaluateObservationFreshness({ ...base, observations, asOf: '2026-09-07' })
      .applicability,
    'CURRENT',
  );
  const result = evaluateObservationFreshness({
    ...base,
    observations,
    asOf: '2026-09-08',
  });
  assert.equal(result.applicability, 'HISTORICAL');
  assert.equal(result.currentSufficiency, 'NOT_CURRENTLY_APPLICABLE');
  assert.deepEqual(base.observation, before);
});

test('restoration clears a legacy flag without bypassing age or source blockers', () => {
  const observation = {
    ...base.observation,
    record_states: ['CURRENT', 'RETEST_REQUIRED'],
  };
  const events = [event('CURRENT_SUFFICIENCY_RESTORED')];
  assert.equal(
    evaluateObservationFreshness({
      ...base,
      observation,
      events,
      asOf: '2026-09-07',
    }).currentSufficiency,
    'SUFFICIENT',
  );
  const expired = evaluateObservationFreshness({
    ...base,
    observation,
    events,
    asOf: '2026-10-02',
  });
  assert.deepEqual(expired.sufficiencyReasons, ['AGE_THRESHOLD_EXCEEDED']);
  events.push(event('SOURCE_UNAVAILABLE', 'source', 'source-test'));
  assert.equal(
    evaluateObservationFreshness({
      ...base,
      observation,
      events,
      asOf: '2026-09-07',
    }).currentSufficiency,
    'RETEST_REQUIRED',
  );
});

test('as-of evaluation excludes events not yet recorded', () => {
  const events = [{ ...event('RETEST_REQUIRED'), recorded_on: '2026-09-09' }];
  assert.equal(
    evaluateObservationFreshness({ ...base, events, asOf: '2026-09-07' })
      .currentSufficiency,
    'SUFFICIENT',
  );
});

test('all supporting sources must be checked before availability is AVAILABLE', () => {
  const sourceIds = ['source-test', 'source-second'];
  const events = [event('SOURCE_AVAILABLE', 'source', 'source-test')];
  assert.equal(
    evaluateObservationFreshness({
      ...base,
      sourceIds,
      events,
      asOf: '2026-09-07',
    }).sourceAvailability,
    'UNKNOWN',
  );
  events.push(event('SOURCE_AVAILABLE', 'source', 'source-second'));
  assert.equal(
    evaluateObservationFreshness({
      ...base,
      sourceIds,
      events,
      asOf: '2026-09-07',
    }).sourceAvailability,
    'AVAILABLE',
  );
});

test('PASS, FAIL and evidence gaps remain immutable under retest requirements', () => {
  for (const result_status_id of [
    'VERIFIED',
    'OBSERVED_FAILURE',
    'NO_PUBLIC_EVIDENCE',
  ]) {
    const observation = { ...base.observation, result_status_id };
    const before = structuredClone(observation);
    evaluateObservationFreshness({ ...base, observation, asOf: '2026-10-02' });
    assert.deepEqual(observation, before);
  }
});

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
