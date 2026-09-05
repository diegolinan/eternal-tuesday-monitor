const unique = (items) =>
  [...new Set(items)].sort((left, right) => left.localeCompare(right));

export function resolveApiAvailability(model) {
  const sourceIds = unique(model.provenance.map((item) => item.source_id));
  if (!model.api_model_id)
    return {
      state: 'UNKNOWN',
      reasons: ['EXACT_API_ID_NOT_ESTABLISHED'],
      source_ids: sourceIds,
    };
  if (['DEPRECATED', 'RETIRED', 'SUPERSEDED'].includes(model.release_state))
    return {
      state: 'UNAVAILABLE',
      reasons: ['MODEL_LIFECYCLE_BLOCKED'],
      source_ids: sourceIds,
    };
  if (model.api_state === 'API_PENDING')
    return {
      state: 'UNAVAILABLE',
      reasons: ['API_DOCUMENTED_AS_PENDING'],
      source_ids: sourceIds,
    };
  return {
    state: 'UNKNOWN',
    reasons: ['PUBLIC_SOURCE_IDENTITY_ONLY'],
    source_ids: sourceIds,
  };
}

function assessProbe(model, _availability, profile, _policy) {
  const base = {
    probe_id: profile.probe_id,
    methodology_version_id: null,
    endpoint: null,
    evaluator_version: null,
    testability: 'NOT_API_TESTABLE',
  };
  if (model.review_reasons.length)
    return {
      ...base,
      state: 'REVIEW_REQUIRED',
      reasons: ['IDENTITY_OR_SOURCE_REVIEW_REQUIRED'],
    };
  return {
    ...base,
    state: 'REVIEW_REQUIRED',
    reasons: ['NO_CURRENT_BEHAVIORAL_EVIDENCE'],
  };
}

export function assessModelAdoption({
  model,
  eventId,
  policy,
  probes,
  observations,
  evaluationResults: _evaluationResults = [],
  sourceOutcomes,
  sourceConfig,
  asOf,
  prior,
}) {
  const availability = resolveApiAvailability(
    model,
    sourceOutcomes,
    sourceConfig,
  );
  const probeRecords = probes.map((probe) => {
    const profile = policy.probe_profiles.find(
      (item) => item.probe_id === probe.id,
    );
    if (!profile)
      return {
        probe_id: probe.id,
        state: 'REVIEW_REQUIRED',
        reasons: ['PROBE_PROFILE_NOT_CONFIGURED'],
        methodology_version_id: null,
        endpoint: null,
        evaluator_version: null,
      };
    return assessProbe(model, availability, profile, policy);
  });
  const eligible = probeRecords.filter((item) => item.state === 'ELIGIBLE');
  const compatible = probeRecords.filter((item) =>
    ['ELIGIBLE', 'BLOCKED'].includes(item.state),
  );
  const testabilityState = eligible.length
    ? eligible.length === probeRecords.length
      ? 'EVALUATABLE'
      : 'PARTIALLY_TESTABLE'
    : compatible.length
      ? 'PARTIALLY_TESTABLE'
      : probeRecords.every((item) => item.state === 'NOT_TESTABLE')
        ? 'NOT_TESTABLE'
        : 'REVIEW_REQUIRED';
  const empirical = observations.filter(
    (observation) =>
      observation.model_id === model.id &&
      [
        'evidence-controlled-experiment',
        'evidence-reproduced-observation',
      ].includes(observation.evidence_class_id),
  );
  const queue = empirical.length
    ? {
        state: 'ALREADY_TESTED',
        reasons: ['FRESHNESS_POLICY_CONTROLS_RETEST'],
        execution_authorized: false,
      }
    : {
          state: 'TEST_REQUIRED',
          reasons: ['NO_CURRENT_BEHAVIORAL_EVIDENCE'],
          execution_authorized: false,
      };
  const record = {
    model_id: model.id,
    vendor_id: model.vendor_id,
    api_model_id: model.api_model_id,
    originating_discovery_event_id: eventId,
    assessed_on: asOf,
    api_availability: availability,
    testability_state: testabilityState,
    testability_reasons: unique(probeRecords.flatMap((item) => item.reasons)),
    probes: probeRecords,
    execution_state: 'NOT_RUN',
    queue,
  };
  if (prior) {
    const withoutDate = ({ assessed_on: _assessedOn, ...value }) => value;
    if (
      JSON.stringify(withoutDate(prior)) === JSON.stringify(withoutDate(record))
    )
      record.assessed_on = prior.assessed_on;
  }
  return record;
}

export function buildAdoptionRegister({
  models,
  events,
  catalog,
  policy,
  probes,
  observations,
  evaluationResults = [],
  sourceOutcomes = [],
  sourceConfig = [],
  asOf,
  previous = { records: [] },
}) {
  const relevant = new Set(
    catalog
      .filter((item) => item.relevance_state === 'DISCOVERED_RELEVANT')
      .map((item) => item.id),
  );
  const eventByModel = new Map();
  for (const event of events) eventByModel.set(event.model.id, event.id);
  const priorByModel = new Map(
    previous.records.map((item) => [item.model_id, item]),
  );
  return {
    schema_version: '1.0.0',
    policy_id: policy.policy_id,
    records: models
      .filter((model) => relevant.has(model.id))
      .map((model) =>
        assessModelAdoption({
          model,
          eventId: eventByModel.get(model.id) ?? null,
          policy,
          probes,
          observations,
          evaluationResults,
          sourceOutcomes,
          sourceConfig,
          asOf,
          prior: priorByModel.get(model.id),
        }),
      )
      .sort((left, right) => left.model_id.localeCompare(right.model_id)),
  };
}
