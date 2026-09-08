import { activeCandidateReviews } from './review.mjs';

export function buildPublicEvidenceStatus(
  report,
  { candidates: candidateLedger = [], reviews = [], decisions = [] } = {},
) {
  const retractedBatches = new Set(
    decisions
      .filter((decision) => decision.decision === 'RETRACTED_PIPELINE_DEFECT')
      .map((decision) => decision.candidate_batch_generated_at),
  );
  const isActiveCandidate = (candidate) =>
    !retractedBatches.has(candidate.discovered_at);
  const latestCandidates = (report.candidates ?? []).filter(isActiveCandidate);
  const candidatesById = new Map(
    [...candidateLedger, ...latestCandidates]
      .filter(isActiveCandidate)
      .map((candidate) => [candidate.id, candidate]),
  );
  const candidates = [...candidatesById.values()];
  let latestReviewAt = null;
  const counts = {
    latestSearchLeads: latestCandidates.length,
    total: candidates.length,
    pending: 0,
    reviewed: 0,
    reproductionRequired: 0,
    supportingSourcesAccepted: 0,
    needsMoreInformation: 0,
    closedWithoutPromotion: 0,
    officialClaims: candidates.filter(
      (candidate) => candidate.claim_class === 'OFFICIAL_CAPABILITY_CLAIM',
    ).length,
    publicReports: candidates.filter((candidate) =>
      candidate.claim_class.startsWith('PUBLIC_'),
    ).length,
    researchResults: candidates.filter(
      (candidate) => candidate.claim_class === 'RESEARCH_RESULT',
    ).length,
  };

  for (const candidate of candidates) {
    const active = activeCandidateReviews(reviews, candidate.id);
    if (active.length > 1)
      throw new Error(`MULTIPLE_ACTIVE_REVIEWS:${candidate.id}`);
    if (active.length === 0) {
      counts.pending += 1;
      continue;
    }

    counts.reviewed += 1;
    if (
      active[0].decided_at &&
      (!latestReviewAt || active[0].decided_at > latestReviewAt)
    )
      latestReviewAt = active[0].decided_at;
    switch (active[0].decision) {
      case 'REQUIRES_BEHAVIORAL_REPRODUCTION':
        counts.reproductionRequired += 1;
        break;
      case 'ACCEPTED_AS_SUPPORTING_SOURCE':
        counts.supportingSourcesAccepted += 1;
        break;
      case 'NEEDS_MORE_INFORMATION':
        counts.needsMoreInformation += 1;
        break;
      default:
        counts.closedWithoutPromotion += 1;
    }
  }

  return {
    schemaVersion: '1.2.0',
    generatedAt: report.generated_at,
    lastSearchAt: report.generated_at,
    latestReviewAt,
    state: report.state,
    channels: report.channels,
    candidateCounts: counts,
    // Third-party titles are intentionally not republished. The public surface
    // exposes aggregate review states without exposing operational mechanics.
    latestCandidates: [],
  };
}
