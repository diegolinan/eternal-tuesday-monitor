const successfulSourceStates = new Set(['OK', 'NOT_MODIFIED']);

const unique = (values) => [...new Set(values.filter(Boolean))];

const latestTimestamp = (values) =>
  values
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
    .at(-1) ?? null;

function sourceStatus(checks, identityChanged) {
  if (!checks.length) return 'NOT_RECORDED';
  const successful = checks.filter((check) =>
    successfulSourceStates.has(check.result_status),
  ).length;
  if (successful === 0) return 'NEEDS_ATTENTION';
  if (successful !== checks.length) return 'PARTIAL';
  return identityChanged ? 'IDENTITY_CHANGED' : 'CHECKED_NO_CHANGE';
}

function evaluationStatus(results, evidenceProbes) {
  if (!results.length)
    return evidenceProbes > 0 ? 'EVIDENCE_RECORDED' : 'NEVER_RUN';
  return results.every((result) => result.status === 'OPERATIONAL_ERROR')
    ? 'OPERATIONAL_ERROR'
    : 'COMPLETED';
}

export function compileModelOperations({
  monitorModels,
  report,
  evaluationResults = [],
  completedAt = null,
}) {
  const liveModels = new Map(
    (report.models ?? []).map((model) => [model.id, model]),
  );
  const reportEvents = report.events ?? [];
  const sourceChecks = report.source_checks ?? [];
  const reportCheckedAt = latestTimestamp(
    sourceChecks.map((check) => check.checked_at),
  );
  const generatedAt = completedAt ?? reportCheckedAt;
  if (!generatedAt)
    throw new Error(
      'Model operations require a completed or source-check time',
    );

  return {
    schemaVersion: '1.0.0',
    generatedAt,
    models: monitorModels.map((model) => {
      const live = liveModels.get(model.id);
      const provenance = live?.provenance ?? [];
      const provenanceUrls = new Set(provenance.map((item) => item.url));
      const provenanceSources = new Set(
        provenance.map((item) => item.source_id),
      );
      const matchingChecks = sourceChecks.filter(
        (check) =>
          provenanceUrls.has(check.url) ||
          (provenanceUrls.size === 0 && provenanceSources.has(check.source_id)),
      );
      const identityChanged = reportEvents.some(
        (event) => event.model?.id === model.id,
      );
      const modelResults = evaluationResults.filter(
        (result) => result.model_id === model.id,
      );
      const completedResults = modelResults.filter(
        (result) => result.status !== 'OPERATIONAL_ERROR',
      );
      const observedProbes = model.probeCoverage.filter(
        (probe) => probe.state === 'TESTED' || probe.empiricalResult,
      );

      return {
        id: model.id,
        sourceCheck: {
          state: sourceStatus(matchingChecks, identityChanged),
          checkedAt: latestTimestamp(
            matchingChecks.map((check) => check.checked_at),
          ),
          checkedSources: matchingChecks.filter((check) =>
            successfulSourceStates.has(check.result_status),
          ).length,
          expectedSources: provenanceUrls.size,
        },
        eligibilityCheck: {
          state: live?.eligibility?.state ?? model.testabilityState,
          checkedAt: live ? generatedAt : null,
          stateChangedOn: model.adoptionAssessedOn,
          reasons: unique(
            live?.eligibility?.reasons ?? model.evaluationReasons ?? [],
          ),
        },
        behavioralEvaluation: {
          state: evaluationStatus(modelResults, observedProbes.length),
          lastAttemptAt: latestTimestamp(
            modelResults.map((result) => result.executed_at),
          ),
          lastEvidenceAt: latestTimestamp(
            completedResults.map((result) => result.executed_at),
          ),
          lastEvidenceOn: latestTimestamp(
            observedProbes.map((probe) => probe.verifiedOn),
          ),
          attemptedProbes: unique(modelResults.map((result) => result.probe_id))
            .length,
          evidenceProbes: observedProbes.length,
          totalProbes: model.probeCoverage.length,
        },
      };
    }),
  };
}
