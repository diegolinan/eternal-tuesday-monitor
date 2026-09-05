import { latestModels, eligibility } from './lifecycle.mjs';
export function projectModels(events, observations, policy, vendors, asOf) {
  return latestModels(events.filter((e) => e.recorded_on <= asOf))
    .map((model) => {
      const accepted = observations.filter(
        (o) =>
          o.model_id === model.id &&
          policy.methodologies.some(
            (m) =>
              m.id === o.methodology_version_id &&
              m.api_surface_id === o.surface_id,
          ) &&
          [
            'evidence-controlled-experiment',
            'evidence-reproduced-observation',
          ].includes(o.evidence_class_id),
      );
      const dates = accepted
        .filter((o) => o.observation_date.precision === 'day')
        .map((o) => o.observation_date.value)
        .sort();
      const compatible = eligibility(model, policy, asOf);
      return {
        id: model.id,
        vendor: vendors.get(model.vendor_id).name,
        name: model.display_name,
        apiModelId: model.api_model_id,
        releaseState: model.release_state,
        apiState: model.api_state,
        accountAccess: model.account_access,
        accountCheckedOn: model.account_checked_on,
        discoveredOn: model.discovered_on,
        releasedOn: model.released_on,
        firstTestedOn: dates[0] ?? null,
        lastTestedOn: dates.at(-1) ?? null,
        eligibility: compatible.state,
        eligibilityReasons: compatible.reasons,
        testing: accepted.length
          ? 'TESTED'
          : compatible.targets.length
            ? 'TEST_PENDING'
            : 'NOT_YET_TESTED',
        sources: [...new Set(model.provenance.map((p) => p.url))],
        reviewReasons: model.review_reasons,
      };
    })
    .sort(
      (a, b) =>
        b.discoveredOn.localeCompare(a.discoveredOn) ||
        a.vendor.localeCompare(b.vendor) ||
        a.name.localeCompare(b.name),
    );
}
