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
      const dates = lifecycle.empiricalObservations
        .filter((o) => o.observation_date.precision === 'day')
        .map((o) => o.observation_date.value)
        .sort();
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
        lifecycleState: lifecycle.lifecycleState,
        testabilityState: lifecycle.testability.state,
        evaluationReasons: lifecycle.testability.reasons,
        probeCoverage: lifecycle.probeCoverage,
        surfaces,
        sources: [...new Set(model.provenance.map((p) => p.url))],
        reviewReasons: model.review_reasons,
        defaultProminence: isPubliclyProminent({
          lifecycleState: lifecycle.lifecycleState,
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
