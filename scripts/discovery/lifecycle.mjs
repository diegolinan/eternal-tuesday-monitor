import { createHash } from 'node:crypto';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const normalizeName = (value) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');
const union = (a, b) =>
  [...new Set([...a, ...b])].sort((left, right) => left.localeCompare(right));
export function latestModels(events) {
  const map = new Map();
  for (const event of events) map.set(event.model.id, event.model);
  return [...map.values()];
}

export function eligibility(model, policy, asOf) {
  const reason = [];
  const targets = [];
  if (!policy.providers.includes(model.vendor_id))
    reason.push('PROVIDER_DISABLED');
  if (policy.denied_api_ids.includes(model.api_model_id))
    reason.push('MODEL_DENIED');
  if (model.review_reasons.length)
    reason.push('IDENTITY_OR_SOURCE_REVIEW_REQUIRED');
  if (['DEPRECATED', 'RETIRED', 'SUPERSEDED'].includes(model.release_state))
    reason.push('MODEL_LIFECYCLE_BLOCKED');
  if (!model.api_model_id || model.api_state !== 'API_AVAILABLE')
    reason.push(model.api_state);
  if (model.account_access !== 'ACCESS_CONFIRMED')
    reason.push('ACCOUNT_ACCESS_NOT_CONFIRMED');
  const age = model.account_checked_on
    ? (Date.parse(asOf) - Date.parse(model.account_checked_on)) / 86400000
    : Infinity;
  if (age < 0 || age > (policy.max_access_check_age_days ?? 1))
    reason.push('ACCOUNT_ACCESS_CHECK_STALE');
  const approved = policy.methodologies.filter(
    (method) =>
      method.status === 'approved' && method.provider_id === model.vendor_id,
  );
  if (!approved.length) reason.push('NO_APPROVED_EXECUTABLE_METHODOLOGY');
  for (const method of approved) {
    const compatible =
      model.endpoints.includes(method.endpoint) &&
      method.required_capabilities.every((capability) =>
        model.capabilities.includes(capability),
      ) &&
      method.required_parameters.every((parameter) =>
        model.supported_parameters.includes(parameter),
      );
    if (compatible && reason.length === 0)
      targets.push({
        model_id: model.id,
        vendor_id: model.vendor_id,
        api_model_id: model.api_model_id,
        surface: 'PROVIDER_API',
        endpoint: method.endpoint,
        methodology_id: method.id,
        execution_enabled: false,
      });
  }
  if (approved.length && !targets.length && !reason.length)
    reason.push('ENDPOINT_OR_PARAMETERS_UNSUPPORTED');
  return {
    state: targets.length
      ? 'PROBE_ELIGIBLE'
      : model.api_state === 'API_AVAILABLE' &&
          reason.some((r) =>
            [
              'ENDPOINT_OR_PARAMETERS_UNSUPPORTED',
              'NO_APPROVED_EXECUTABLE_METHODOLOGY',
            ].includes(r),
          )
        ? 'HARNESS_UNSUPPORTED'
        : 'NOT_YET_TESTABLE',
    reasons: reason,
    targets,
  };
}

const EMPIRICAL_EVIDENCE = new Set([
  'evidence-controlled-experiment',
  'evidence-reproduced-observation',
]);

export function assessTestability(model, policy, asOf) {
  const assessment = eligibility(model, policy, asOf);
  if (assessment.targets.length)
    return {
      state: 'AVAILABLE',
      reasons: assessment.reasons,
      targets: assessment.targets,
    };
  const determinateBlockers = new Set([
    'PROVIDER_DISABLED',
    'MODEL_DENIED',
    'MODEL_LIFECYCLE_BLOCKED',
    'API_PENDING',
    'ACCESS_DENIED',
    'ERROR',
    'ENDPOINT_OR_PARAMETERS_UNSUPPORTED',
  ]);
  const knownApiWithoutMethod =
    model.api_state === 'API_AVAILABLE' &&
    model.account_access === 'ACCESS_CONFIRMED' &&
    assessment.reasons.includes('NO_APPROVED_EXECUTABLE_METHODOLOGY');
  return {
    state:
      knownApiWithoutMethod ||
      assessment.reasons.some((reason) => determinateBlockers.has(reason))
        ? 'NOT_CURRENTLY_AVAILABLE'
        : 'UNKNOWN_REVIEW_REQUIRED',
    reasons: assessment.reasons,
    targets: [],
  };
}

export function evaluationLifecycle({
  model,
  observations,
  policy,
  probes,
  asOf,
  pending = false,
}) {
  const empirical = observations.filter(
    (observation) =>
      observation.model_id === model.id &&
      EMPIRICAL_EVIDENCE.has(observation.evidence_class_id),
  );
  const testability = assessTestability(model, policy, asOf);
  const probeCoverage = probes.map((probe) => {
    const records = empirical.filter(
      (observation) => observation.probe_id === probe.id,
    );
    return {
      id: probe.id,
      name: probe.name,
      state: records.some(
        (observation) => observation.currentSufficiency === 'RETEST_REQUIRED',
      )
        ? 'RETEST_REQUIRED'
        : records.length
          ? 'TESTED'
          : 'NOT_TESTED',
    };
  });
  const retestRequired = probeCoverage.some(
    (probe) => probe.state === 'RETEST_REQUIRED',
  );
  const lifecycleState = retestRequired
    ? 'RETEST_REQUIRED'
    : empirical.length
      ? 'TESTED'
      : pending
        ? 'EVALUATION_PENDING'
        : testability.state === 'AVAILABLE'
          ? 'EVALUATION_AVAILABLE'
          : testability.state === 'NOT_CURRENTLY_AVAILABLE'
            ? 'EVALUATION_NOT_POSSIBLE'
            : 'DISCOVERED';
  return {
    lifecycleState,
    testability,
    probeCoverage,
    empiricalObservations: empirical,
  };
}

export function normalizeDiscoveries(facts, previous, catalog, asOf) {
  const models = structuredClone(previous);
  const touched = new Set();
  const apiClaims = new Map();
  const freshProvenance = new Map();
  for (const incoming of facts) {
    if (!incoming.display_name) throw new Error('DISPLAY_NAME_REQUIRED');
    const nameKey = normalizeName(incoming.display_name);
    const sameVendor = models.filter((m) => m.vendor_id === incoming.vendor_id);
    const exact = incoming.api_model_id
      ? sameVendor.filter(
          (m) =>
            m.api_model_id === incoming.api_model_id ||
            m.aliases.includes(incoming.api_model_id),
        )
      : [];
    const named = sameVendor.filter(
      (m) =>
        normalizeName(m.display_name) === nameKey &&
        (!m.api_model_id || !incoming.api_model_id),
    );
    const matching = exact.length ? exact : named;
    const knownCatalog = catalog.filter(
      (m) =>
        m.vendor_id === incoming.vendor_id && normalizeName(m.name) === nameKey,
    );
    let model = matching.length === 1 ? matching[0] : null;
    if (!model) {
      const identity = `${incoming.vendor_id}|${incoming.api_model_id ? `api:${incoming.api_model_id}` : `name:${nameKey}`}`;
      const catalogId =
        knownCatalog.length === 1 &&
        !models.some((m) => m.id === knownCatalog[0].id)
          ? knownCatalog[0].id
          : null;
      model = {
        id: catalogId ?? `model-discovered-${hash(identity).slice(0, 20)}`,
        vendor_id: incoming.vendor_id,
        display_name: incoming.display_name,
        api_model_id: null,
        family: null,
        version: null,
        channel: 'UNKNOWN',
        released_on: null,
        discovered_on: asOf,
        api_available_on: null,
        account_checked_on: null,
        first_tested_on: null,
        last_tested_on: null,
        release_state: 'DISCOVERED',
        api_state: 'API_UNKNOWN',
        account_access: 'UNKNOWN',
        endpoints: [],
        capabilities: [],
        supported_parameters: [],
        aliases: [],
        supersedes_model_id: null,
        provenance: [],
        review_reasons: [],
      };
      if (matching.length > 1 || knownCatalog.length > 1)
        model.review_reasons.push('AMBIGUOUS_IDENTITY');
      if (
        !catalogId &&
        catalog.some(
          (known) =>
            known.vendor_id === incoming.vendor_id &&
            (nameKey.endsWith(` ${normalizeName(known.name)}`) ||
              normalizeName(known.name).endsWith(` ${nameKey}`)),
        )
      ) {
        model.review_reasons.push('POSSIBLE_EXISTING_CATALOG_IDENTITY');
      }
      models.push(model);
    }
    if (!touched.has(model.id)) {
      // Current metadata must be re-established by this public-source batch.
      // Historical authenticated checks remain in the append-only event ledger,
      // but never leak into the current public interpretation.
      model.endpoints = [];
      model.capabilities = [];
      model.supported_parameters = [];
      model.provenance = [];
      model.api_state = 'API_UNKNOWN';
      model.account_access = 'UNKNOWN';
      model.account_checked_on = null;
      model.api_available_on = null;
    }
    touched.add(model.id);
    freshProvenance.set(model.id, [
      ...(freshProvenance.get(model.id) ?? []),
      ...(incoming.provenance ?? []),
    ]);
    for (const field of [
      'api_model_id',
      'family',
      'version',
      'released_on',
      'supersedes_model_id',
    ]) {
      if (incoming[field] != null) {
        if (model[field] != null && model[field] !== incoming[field])
          model.review_reasons = union(model.review_reasons, [
            `CONFLICT_${field.toUpperCase()}`,
          ]);
        else model[field] = incoming[field];
      }
    }
    if (
      incoming.display_name !== incoming.api_model_id &&
      model.display_name === model.api_model_id
    )
      model.display_name = incoming.display_name;
    const claims = apiClaims.get(model.id) ?? new Set();
    if (incoming.api_state !== 'API_UNKNOWN') claims.add(incoming.api_state);
    apiClaims.set(model.id, claims);
    if (claims.has('API_PENDING') && claims.has('API_AVAILABLE'))
      model.review_reasons = union(model.review_reasons, [
        'CONFLICT_API_AVAILABILITY',
      ]);
    if (incoming.api_state !== 'API_UNKNOWN')
      model.api_state = incoming.api_state;
    if (incoming.account_access === 'ACCESS_CONFIRMED') {
      if (
        model.account_access !== 'ACCESS_CONFIRMED' ||
        !model.account_checked_on ||
        (Date.parse(asOf) - Date.parse(model.account_checked_on)) / 86400000 > 7
      )
        model.account_checked_on = asOf;
      model.account_access = incoming.account_access;
      model.api_available_on ??= asOf;
    }
    if (incoming.release_state !== 'DISCOVERED') {
      // A model-list success cannot reverse a documented retirement/deprecation.
      if (
        !['DEPRECATED', 'RETIRED', 'SUPERSEDED'].includes(
          model.release_state,
        ) ||
        incoming.release_state !== 'RELEASED'
      )
        model.release_state = incoming.release_state;
    }
    if (incoming.channel !== 'UNKNOWN') model.channel = incoming.channel;
    for (const field of [
      'endpoints',
      'capabilities',
      'supported_parameters',
      'aliases',
    ])
      model[field] = union(model[field], incoming[field] ?? []);
    for (const p of incoming.provenance ?? []) {
      if (
        !model.provenance.some(
          (existing) =>
            existing.source_id === p.source_id && existing.url === p.url,
        )
      )
        model.provenance.push(p);
    }
  }
  // Different exact IDs sharing a display name are not automatically aliases.
  for (const model of models) {
    if (
      models.some(
        (other) =>
          other.id !== model.id &&
          other.vendor_id === model.vendor_id &&
          normalizeName(other.display_name) ===
            normalizeName(model.display_name),
      )
    ) {
      model.review_reasons = union(model.review_reasons, [
        'AMBIGUOUS_DISPLAY_NAME',
      ]);
      touched.add(model.id);
    }
    const prior = previous.find((old) => old.id === model.id);
    if (
      prior &&
      JSON.stringify({ ...prior, provenance: [] }) !==
        JSON.stringify({ ...model, provenance: [] })
    ) {
      for (const p of freshProvenance.get(model.id) ?? [])
        if (
          !model.provenance.some(
            (old) =>
              old.source_id === p.source_id &&
              old.url === p.url &&
              old.sha256 === p.sha256,
          )
        )
          model.provenance.push(p);
    }
  }
  return models
    .filter((model) => touched.has(model.id))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function proposeEvents(models, previous, asOf) {
  const semanticModel = (model) => ({
    ...model,
    provenance: model.provenance
      .map((item) => ({ source_id: item.source_id, url: item.url }))
      .sort((left, right) =>
        `${left.source_id}|${left.url}`.localeCompare(`${right.source_id}|${right.url}`),
      ),
  });
  return models
    .filter(
      (model) =>
        JSON.stringify(semanticModel(model)) !==
        JSON.stringify(semanticModel(previous.find((old) => old.id === model.id) ?? { ...model, id: '__missing__' })),
    )
    .map((model) => {
      const prior = previous.find((old) => old.id === model.id);
      const semantic = semanticModel(model);
      const type = !prior
        ? 'MODEL_DISCOVERED'
        : prior.supersedes_model_id !== model.supersedes_model_id
          ? 'MODEL_RELATIONSHIP_CHANGED'
          : 'MODEL_METADATA_CHANGED';
      return {
        schema_version: '1.0.0',
        id: `discovery-${hash(`${type}|${JSON.stringify(semantic)}`).slice(0, 24)}`,
        recorded_on: asOf,
        type,
        model,
      };
    });
}

export function supersessionEvents(models, catalog, policy, asOf) {
  if (!policy.supersession_retest_enabled) return [];
  return models
    .filter(
      (m) =>
        m.supersedes_model_id &&
        !m.review_reasons.length &&
        catalog.some(
          (entry) =>
            entry.id === m.id &&
            entry.supersedes_model_id === m.supersedes_model_id &&
            entry.supersession_review?.status === 'REVIEWED_ACCEPTED',
        ) &&
        catalog.some(
          (old) =>
            old.id === m.supersedes_model_id && old.vendor_id === m.vendor_id,
        ),
    )
    .map((m) => ({
      schema_version: '1.0.0',
      id: `state-${hash(`${m.id}|${m.supersedes_model_id}`).slice(0, 20)}`,
      subject_type: 'model',
      subject_id: m.supersedes_model_id,
      event_type: 'SUPERSEDED',
      effective_on: asOf,
      recorded_on: asOf,
      reason: `Explicit reviewed model relationship: superseded by ${m.id}. No consumer-product model mapping is inferred.`,
    }));
}
