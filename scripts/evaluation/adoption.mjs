const unique = (items) =>
  [...new Set(items)].sort((left, right) => left.localeCompare(right));

export function resolveApiAvailability(model, sourceOutcomes, sourceConfig) {
  const authenticated = sourceConfig.find(
    (source) =>
      source.vendor_id === model.vendor_id &&
      source.type === 'authenticated-model-list',
  );
  const outcome = authenticated
    ? sourceOutcomes.find((item) => item.source_id === authenticated.id)
    : null;
  const sourceIds = unique([
    ...model.provenance.map((item) => item.source_id),
    ...(authenticated ? [authenticated.id] : []),
  ]);
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
  if (model.account_access === 'ACCESS_CONFIRMED')
    return {
      state: 'AVAILABLE',
      reasons: ['EXACT_ID_VISIBLE_TO_CONFIGURED_ACCOUNT'],
      source_ids: sourceIds,
    };
  if (outcome?.status === 'CREDENTIAL_NOT_CONFIGURED')
    return {
      state: 'AUTH_REQUIRED_TO_VERIFY',
      reasons: ['PROVIDER_CREDENTIAL_NOT_CONFIGURED'],
      source_ids: sourceIds,
    };
  if (outcome?.status === 'OK')
    return {
      state: 'UNAVAILABLE',
      reasons: ['EXACT_ID_NOT_VISIBLE_TO_CONFIGURED_ACCOUNT'],
      source_ids: sourceIds,
    };
  if (
    outcome?.status === 'ACCOUNT_ACCESS_DENIED' ||
    model.account_access === 'ACCESS_DENIED'
  )
    return {
      state: 'UNKNOWN',
      reasons: ['CONFIGURED_ACCOUNT_ACCESS_DENIED'],
      source_ids: sourceIds,
    };
  if (outcome && outcome.status !== 'OK')
    return {
      state: 'UNKNOWN',
      reasons: [`API_CHECK_${outcome.status}`],
      source_ids: sourceIds,
    };
  return {
    state: 'UNKNOWN',
    reasons: [
      authenticated
        ? 'API_AVAILABILITY_NOT_CHECKED_YET'
        : 'PROVIDER_METADATA_INSUFFICIENT',
    ],
    source_ids: sourceIds,
  };
}

function assessProbe(model, availability, profile, policy) {
  const base = {
    probe_id: profile.probe_id,
    methodology_version_id: profile.methodology_version_id,
    endpoint: profile.endpoint,
    evaluator_version: profile.evaluator_version,
    testability: profile.testability ?? 'NOT_API_TESTABLE',
  };
  if (model.review_reasons.length)
    return {
      ...base,
      state: 'REVIEW_REQUIRED',
      reasons: ['IDENTITY_OR_SOURCE_REVIEW_REQUIRED'],
    };
  if (profile.status !== 'APPROVED')
    return {
      ...base,
      state: 'REVIEW_REQUIRED',
      reasons: ['NO_APPROVED_METHODOLOGY'],
    };
  if (profile.provider_id !== model.vendor_id)
    return {
      ...base,
      state: 'REVIEW_REQUIRED',
      reasons: ['PROVIDER_SEMANTICS_REQUIRE_REVIEW'],
    };
  const missingHarness = profile.required_harness_capabilities.filter(
    (item) => !policy.harness_capabilities.includes(item),
  );
  if (missingHarness.length)
    return {
      ...base,
      state: 'REVIEW_REQUIRED',
      reasons: missingHarness.map(
        (item) => `HARNESS_MISSING_${item.toUpperCase()}`,
      ),
    };
  const missing = profile.required_model_capabilities.filter(
    (item) => !model.capabilities.includes(item),
  );
  const endpointMissing =
    profile.endpoint && !model.endpoints.includes(profile.endpoint);
  if (endpointMissing || missing.length)
    return {
      ...base,
      state: 'NOT_TESTABLE',
      reasons: unique([
        ...(endpointMissing ? ['REQUIRED_ENDPOINT_NOT_DOCUMENTED'] : []),
        ...missing.map(
          (item) => `CAPABILITY_NOT_DOCUMENTED_${item.toUpperCase()}`,
        ),
      ]),
    };
  if (availability.state !== 'AVAILABLE')
    return { ...base, state: 'BLOCKED', reasons: availability.reasons };
  return {
    ...base,
    state: 'ELIGIBLE',
    reasons: ['APPROVED_PROFILE_COMPATIBLE'],
  };
}

export function assessModelAdoption({
  model,
  eventId,
  policy,
  probes,
  observations,
  evaluationResults = [],
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
  const allApiResults = evaluationResults.filter((result) => result.model_id === model.id);
  const apiResults = allApiResults.filter((result) => result.status !== 'OPERATIONAL_ERROR');
  const operationalResults = allApiResults.filter((result) => result.status === 'OPERATIONAL_ERROR');
  const latestOperational = operationalResults
    .map((result) => result.executed_at)
    .sort((left, right) => right.localeCompare(left))[0];
  const operationalCooldownActive = latestOperational
    ? (Date.parse(`${asOf}T23:59:59Z`) - Date.parse(latestOperational)) / 3_600_000 < policy.limits.cooldown_hours
    : false;
  const automatic = policy.execution.automatic_frontier;
  const frontierAuthorized =
    automatic.enabled &&
    model.discovered_on > automatic.after_discovered_on &&
    automatic.vendor_ids.includes(model.vendor_id);
  const executionAuthorized =
    policy.execution_enabled &&
    (policy.eligible_api_ids.includes(model.api_model_id) || frontierAuthorized) &&
    !policy.manual_only_api_ids.includes(model.api_model_id) &&
    !policy.denied_api_ids.includes(model.api_model_id) &&
    policy.limits.max_scheduled_requests_per_day > 0 &&
    policy.limits.max_scheduled_spend_usd_per_day > 0 &&
    policy.limits.max_runs_per_model_per_day > 0;
  const queue = empirical.length || apiResults.length
    ? {
        state: 'ALREADY_TESTED',
        reasons: ['FRESHNESS_POLICY_CONTROLS_RETEST'],
        execution_authorized: false,
      }
    : operationalCooldownActive
      ? {
          state: 'RETEST_POLICY',
          reasons: ['OPERATIONAL_ERROR_COOLDOWN_ACTIVE'],
          execution_authorized: false,
        }
    : eligible.length
      ? {
          state: 'ELIGIBILITY_READY',
          reasons: executionAuthorized
            ? ['INITIAL_BASELINE_READY']
            : ['EXECUTION_POLICY_DISABLED_OR_ZERO_BUDGET'],
          execution_authorized: executionAuthorized,
        }
      : {
          state: 'BLOCKED',
          reasons: unique(
            compatible.length
              ? availability.reasons
              : probeRecords.flatMap((item) => item.reasons),
          ),
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
    execution_state: apiResults.length ? 'COMPLETED' : operationalResults.length ? 'OPERATIONAL_ERROR' : 'NOT_RUN',
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
