import { latestModels, evaluationLifecycle } from './lifecycle.mjs';
import { isPubliclyProminent } from './decision.mjs';

const fallbackModel = (entry) => ({
  id: entry.id,
  vendor_id: entry.vendor_id,
  display_name: entry.name,
  api_model_id: entry.api_model_id ?? null,
  released_on: null,
  discovered_on: null,
  release_state: entry.release_state ?? 'UNKNOWN',
  api_state: 'API_UNKNOWN',
  account_access: 'UNKNOWN',
  account_checked_on: null,
  endpoints: [],
  capabilities: [],
  supported_parameters: [],
  provenance: entry.discovery_provenance ?? [],
  review_reasons: [],
});

export function projectModels(
  events,
  observations,
  policy,
  vendors,
  asOf,
  options = {},
) {
  const latest = latestModels(events.filter((e) => e.recorded_on <= asOf));
  const byId = new Map(latest.map((model) => [model.id, model]));
  for (const entry of options.catalog ?? [])
    if (entry.identity_status === 'named' && !byId.has(entry.id))
      byId.set(entry.id, fallbackModel(entry));
  const projectedObservations = options.projectedObservations ?? observations;
  return [...byId.values()]
    .map((model) => {
      const catalogEntry = (options.catalog ?? []).find(
        (entry) => entry.id === model.id,
      );
      const relevanceState = catalogEntry?.relevance_state ?? 'UNCLASSIFIED';
      const enriched = observations.map((observation) => {
        const projected = projectedObservations.find(
          (item) => item.id === observation.id,
        );
        return {
          ...observation,
          currentSufficiency: projected?.currentSufficiency,
        };
      });
      const lifecycle = evaluationLifecycle({
        model,
        observations: enriched,
        policy,
        probes: options.probes ?? [],
        asOf,
        pending: relevanceState === 'REVIEW_REQUIRED',
      });
      const adoption = options.adoptionRecords?.get(model.id) ?? null;
      const apiResults = (options.evaluationResults ?? []).filter(
        (result) => result.model_id === model.id,
      );
      const behavioralApiResults = apiResults.filter(
        (result) => result.status !== 'OPERATIONAL_ERROR',
      );
      const probeCoverage = lifecycle.probeCoverage.map((probe) => {
        const assessed = adoption?.probes.find(
          (item) => item.probe_id === probe.id,
        );
        return {
          ...probe,
          eligibilityState: assessed?.state ?? 'NOT_IN_SCOPE',
          eligibilityReasons: assessed?.reasons ?? [],
          methodologyVersionId: assessed?.methodology_version_id ?? null,
          testability: assessed?.testability ?? 'NOT_API_TESTABLE',
          empiricalResult: apiResults.find((result) => result.probe_id === probe.id)?.status ?? null,
          evidenceClass: apiResults.find((result) => result.probe_id === probe.id)?.evidence_class_id ?? null,
          verifiedOn: apiResults.find((result) => result.probe_id === probe.id)?.verified_on ?? null,
          limitations: apiResults.find((result) => result.probe_id === probe.id)?.limitations ?? [],
          requestCount: apiResults.find((result) => result.probe_id === probe.id)?.request_count ?? 0,
        };
      });
      const lifecycleState = lifecycle.empiricalObservations.length || behavioralApiResults.length
        ? behavioralApiResults.length && !lifecycle.empiricalObservations.length
          ? 'TESTED'
          : lifecycle.lifecycleState
        : adoption
          ? adoption.probes.some((item) => item.state === 'ELIGIBLE')
            ? 'EVALUATION_AVAILABLE'
            : adoption.probes.every((item) => item.state === 'NOT_TESTABLE')
              ? 'EVALUATION_NOT_POSSIBLE'
              : 'EVALUATION_PENDING'
          : lifecycle.lifecycleState;
      const dates = [
        ...lifecycle.empiricalObservations
          .filter((o) => o.observation_date.precision === 'day')
          .map((o) => o.observation_date.value),
        ...behavioralApiResults.map((result) => result.verified_on),
      ].sort((left, right) => left.localeCompare(right));
      const surfaces = [
        ...new Map(
          lifecycle.empiricalObservations.map((observation) => {
            const surface = options.surfaces?.get(observation.surface_id);
            const product = surface
              ? options.products?.get(surface.product_id)
              : null;
            return [
              observation.surface_id,
              {
                id: observation.surface_id,
                product: product?.name ?? 'Not established',
                name: surface?.name ?? observation.surface_id,
                kind:
                  observation.surface_id === 'surface-openai-model-api'
                    ? 'PROVIDER_API'
                    : 'CONSUMER_PRODUCT_SURFACE',
              },
            ];
          }),
        ).values(),
      ];
      if (apiResults.length && !surfaces.some((surface) => surface.id === 'surface-openai-model-api')) {
        const surface = options.surfaces?.get('surface-openai-model-api');
        const product = surface ? options.products?.get(surface.product_id) : null;
        surfaces.push({ id: 'surface-openai-model-api', product: product?.name ?? 'OpenAI API', name: surface?.name ?? 'OpenAI model API', kind: 'PROVIDER_API' });
      }
      return {
        id: model.id,
        vendor: vendors.get(model.vendor_id)?.name ?? 'Not established',
        name: model.display_name,
        apiModelId: model.api_model_id,
        releaseState: model.release_state,
        relevanceState,
        apiState: model.api_state,
        accountAccess: model.account_access,
        accountCheckedOn: model.account_checked_on,
        discoveredOn: model.discovered_on,
        releasedOn: model.released_on,
        firstTestedOn: dates[0] ?? null,
        lastTestedOn: dates.at(-1) ?? null,
        lifecycleState,
        testabilityState:
          adoption?.testability_state ?? lifecycle.testability.state,
        evaluationReasons:
          adoption?.testability_reasons ?? lifecycle.testability.reasons,
        apiAvailabilityState: adoption?.api_availability.state ?? 'UNKNOWN',
        apiAvailabilityReasons: adoption?.api_availability.reasons ?? [
          'MODEL_NOT_IN_ADOPTION_SCOPE',
        ],
        adoptionAssessedOn: adoption?.assessed_on ?? null,
        queueState: adoption?.queue.state ?? 'NOT_QUEUED',
        queueReasons: adoption?.queue.reasons ?? [],
        executionState: adoption?.execution_state ?? (apiResults.length ? 'COMPLETED' : 'NOT_RUN'),
        probeCoverage,
        surfaces,
        sources: [...new Set(model.provenance.map((p) => p.url))],
        reviewReasons: model.review_reasons,
        defaultProminence: isPubliclyProminent({
          lifecycleState,
          relevanceState,
        }),
      };
    })
    .sort(
      (a, b) =>
        b.discoveredOn.localeCompare(a.discoveredOn) ||
        a.vendor.localeCompare(b.vendor) ||
        a.name.localeCompare(b.name),
    );
}
