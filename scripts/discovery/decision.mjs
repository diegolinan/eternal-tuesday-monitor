export function evaluateRelevance(model, policy) {
  if (!model.api_model_id)
    return {
      state: 'REVIEW_REQUIRED',
      ruleId: 'exact-api-id-required',
      reason: 'No exact official API identifier was established.',
    };
  for (const rule of policy.rules) {
    if (rule.vendor_id && rule.vendor_id !== model.vendor_id) continue;
    if (!new RegExp(rule.api_id_pattern, 'i').test(model.api_model_id))
      continue;
    return { state: rule.result, ruleId: rule.id, reason: rule.reason };
  }
  return {
    state: policy.fallback.result,
    ruleId: 'fallback-review',
    reason: policy.fallback.reason,
  };
}

export function classifyDiscoveryEvent(
  event,
  previous,
  sources,
  relevancePolicy,
  catalog = [],
) {
  const model = event.model;
  const prior = previous.find((item) => item.id === model.id);
  const relevance = evaluateRelevance(model, relevancePolicy);
  const sourceRecords = model.provenance.map((item) =>
    sources.find((source) => source.id === item.source_id),
  );
  const reasons = [...model.review_reasons];
  if (!model.api_model_id) reasons.push('EXACT_API_ID_REQUIRED');
  if (
    !sourceRecords.length ||
    sourceRecords.some(
      (source) =>
        !source ||
        source.enabled !== true ||
        source.automatic_identity_acceptance !== true ||
        source.authority !==
          relevancePolicy.automatic_acceptance.source_authority ||
        !relevancePolicy.automatic_acceptance.source_types.includes(
          source.type,
        ),
    )
  )
    reasons.push('SOURCE_NOT_AUTOMATICALLY_TRUSTED');
  if (model.supersedes_model_id) reasons.push('RELATIONSHIP_REQUIRES_REVIEW');
  if (prior) reasons.push('METADATA_CHANGE_REQUIRES_REVIEW');
  if (!prior && catalog.some((item) => item.id === model.id))
    reasons.push('EXISTING_CATALOG_IDENTITY_REQUIRES_REVIEW');
  if (relevance.state === 'REVIEW_REQUIRED')
    reasons.push('RELEVANCE_REQUIRES_REVIEW');
  const uniqueReasons = [...new Set(reasons)].sort((left, right) =>
    left.localeCompare(right),
  );
  const automatic = !prior && uniqueReasons.length === 0;
  return {
    event,
    decision: automatic ? 'AUTO_ACCEPT' : 'REVIEW_REQUIRED',
    changeType: event.type,
    relevance,
    reasons: uniqueReasons,
  };
}

export function classifyDiscoveryEvents(
  events,
  previous,
  sources,
  relevancePolicy,
  catalog = [],
) {
  return events.map((event) =>
    classifyDiscoveryEvent(event, previous, sources, relevancePolicy, catalog),
  );
}

export function isPubliclyProminent(model) {
  return (
    [
      'TESTED',
      'RETEST_REQUIRED',
      'EVALUATION_AVAILABLE',
      'EVALUATION_PENDING',
    ].includes(model.lifecycleState) ||
    ['ACTIVE', 'FRONTIER', 'DISCOVERED_RELEVANT', 'REVIEW_REQUIRED'].includes(
      model.relevanceState,
    )
  );
}

export function catalogEntryForDecision(decision, asOf, policyId) {
  const model = decision.event.model;
  return {
    id: model.id,
    vendor_id: model.vendor_id,
    name: model.display_name,
    identity_status: 'named',
    catalog_status: 'ACCEPTED_DISCOVERY',
    api_model_id: model.api_model_id,
    aliases: model.aliases,
    release_state: model.release_state,
    relevance_state:
      decision.decision === 'AUTO_ACCEPT'
        ? decision.relevance.state
        : 'REVIEW_REQUIRED',
    relevance_review: {
      status:
        decision.decision === 'AUTO_ACCEPT'
          ? 'POLICY_CLASSIFIED'
          : 'REVIEW_REQUIRED',
      reviewed_on: asOf,
      reason:
        decision.decision === 'AUTO_ACCEPT'
          ? decision.relevance.reason
          : `Human review required: ${decision.reasons.join(', ')}.`,
      policy_id: policyId,
      rule_id: decision.relevance.ruleId,
    },
    supersedes_model_id: null,
    supersession_review: null,
    discovery_provenance: model.provenance,
  };
}
