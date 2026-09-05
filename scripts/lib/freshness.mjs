const DAY_MS = 86_400_000;

export function dayAge(earlier, later) {
  if (earlier === null) return null;
  const start = Date.parse(`${earlier}T00:00:00Z`);
  const end = Date.parse(`${later}T00:00:00Z`);
  return Math.floor((end - start) / DAY_MS);
}

function latestEvent(events, types) {
  return events
    .filter((event) => types.includes(event.event_type))
    .sort((left, right) =>
      `${right.effective_on}|${right.recorded_on}|${right.id}`.localeCompare(
        `${left.effective_on}|${left.recorded_on}|${left.id}`,
      ),
    )[0];
}

export function evaluateObservationFreshness({
  observation,
  evidenceRecord,
  sourceIds,
  policy,
  events,
  asOf,
  observations = [],
}) {
  const successors = observations.filter(
    (item) =>
      item.supersedes_observation_id === observation.id &&
      item.last_verified_on !== null &&
      item.last_verified_on <= asOf,
  );
  const applicability =
    successors.length > 0
      ? 'HISTORICAL'
      : observation.record_states.includes('CURRENT')
        ? 'CURRENT'
        : 'HISTORICAL';
  const applicableEvents = events
    .filter((event) => event.effective_on <= asOf && event.recorded_on <= asOf)
    .filter(
      (event) =>
        (event.subject_type === 'observation' &&
          event.subject_id === observation.id) ||
        (event.subject_type === 'model' &&
          event.subject_id === observation.model_id) ||
        (event.subject_type === 'surface' &&
          event.subject_id === observation.surface_id) ||
        (event.subject_type === 'methodology' &&
          event.subject_id === observation.methodology_version_id) ||
        (event.subject_type === 'source' &&
          sourceIds.includes(event.subject_id)),
    )
    .sort((left, right) =>
      `${left.effective_on}|${left.recorded_on}|${left.id}`.localeCompare(
        `${right.effective_on}|${right.recorded_on}|${right.id}`,
      ),
    );

  const rule = policy.rules.find(
    (item) => item.evidence_class_id === observation.evidence_class_id,
  );
  const ageDays = dayAge(observation.last_verified_on, asOf);
  const reasons = [];

  const observationEvents = applicableEvents.filter(
    (event) => event.subject_type === 'observation',
  );
  const explicitState = latestEvent(observationEvents, [
    'RETEST_REQUIRED',
    'CURRENT_SUFFICIENCY_RESTORED',
  ]);
  if (
    observation.record_states.includes('RETEST_REQUIRED') &&
    explicitState?.event_type !== 'CURRENT_SUFFICIENCY_RESTORED'
  ) {
    reasons.push('LEGACY_RETEST_REQUIRED');
  }
  if (explicitState?.event_type === 'RETEST_REQUIRED') {
    reasons.push('EXPLICIT_RETEST_REQUIRED');
  }

  if (
    applicableEvents.some(
      (event) =>
        event.subject_type === 'model' && event.event_type === 'SUPERSEDED',
    )
  ) {
    reasons.push('MODEL_SUPERSEDED');
  }
  if (
    applicableEvents.some(
      (event) =>
        event.subject_type === 'surface' &&
        event.event_type === 'SURFACE_DISCONTINUED',
    )
  ) {
    reasons.push('SURFACE_DISCONTINUED');
  }
  if (
    applicableEvents.some(
      (event) =>
        event.subject_type === 'methodology' &&
        event.event_type === 'METHODOLOGY_SUPERSEDED',
    )
  ) {
    reasons.push('METHODOLOGY_SUPERSEDED');
  }

  const sourceStateEvents = applicableEvents.filter(
    (event) =>
      event.subject_type === 'source' &&
      ['SOURCE_UNAVAILABLE', 'SOURCE_AVAILABLE'].includes(event.event_type),
  );
  const unavailableSources = sourceIds.filter(
    (sourceId) =>
      latestEvent(
        sourceStateEvents.filter((event) => event.subject_id === sourceId),
        ['SOURCE_UNAVAILABLE', 'SOURCE_AVAILABLE'],
      )?.event_type === 'SOURCE_UNAVAILABLE',
  );
  if (unavailableSources.length > 0) reasons.push('SOURCE_UNAVAILABLE');
  if (ageDays === null) reasons.push('VERIFICATION_DATE_UNKNOWN');

  if (!rule) {
    return {
      applicability,
      currentSufficiency: 'NO_APPLICABLE_POLICY',
      sufficiencyReasons: ['NO_APPLICABLE_POLICY', ...reasons],
      ageDays,
      maxAgeDays: null,
      sourceAvailability:
        unavailableSources.length > 0 ? 'UNAVAILABLE' : 'UNKNOWN',
      stateHistory: applicableEvents,
      evidenceRecordId: evidenceRecord.id,
    };
  }

  if (ageDays > rule.max_age_days) reasons.push('AGE_THRESHOLD_EXCEEDED');

  const currentSufficiency =
    reasons.length > 0
      ? 'RETEST_REQUIRED'
      : applicability === 'CURRENT'
        ? 'SUFFICIENT'
        : 'NOT_CURRENTLY_APPLICABLE';

  const sourceAvailability =
    unavailableSources.length > 0
      ? 'UNAVAILABLE'
      : sourceIds.length > 0 &&
          sourceIds.every(
            (sourceId) =>
              latestEvent(
                sourceStateEvents.filter(
                  (event) => event.subject_id === sourceId,
                ),
                ['SOURCE_UNAVAILABLE', 'SOURCE_AVAILABLE'],
              )?.event_type === 'SOURCE_AVAILABLE',
          )
        ? 'AVAILABLE'
        : 'UNKNOWN';

  return {
    applicability,
    currentSufficiency,
    sufficiencyReasons:
      reasons.length > 0
        ? reasons
        : currentSufficiency === 'SUFFICIENT'
          ? ['WITHIN_POLICY_WINDOW']
          : ['HISTORICAL_RECORD'],
    ageDays,
    maxAgeDays: rule.max_age_days,
    sourceAvailability,
    stateHistory: applicableEvents,
    evidenceRecordId: evidenceRecord.id,
  };
}
