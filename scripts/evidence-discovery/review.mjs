import { createHash } from 'node:crypto';

export const candidateReviewDecisions = Object.freeze([
  'REJECTED_IRRELEVANT',
  'REJECTED_UNVERIFIABLE',
  'DUPLICATE',
  'NEEDS_MORE_INFORMATION',
  'ACCEPTED_AS_SUPPORTING_SOURCE',
  'REQUIRES_BEHAVIORAL_REPRODUCTION',
]);

export function activeCandidateReviews(reviews, candidateId) {
  const superseded = new Set(
    reviews
      .filter((review) => review.supersedes_review_id)
      .map((review) => review.supersedes_review_id),
  );
  return reviews.filter(
    (review) =>
      review.candidate_id === candidateId && !superseded.has(review.id),
  );
}

export function buildCandidateReview({
  candidate,
  decision,
  reason,
  reviewer,
  decidedAt,
  supersedesReviewId = null,
  reviews = [],
}) {
  if (!candidate?.id) throw new Error('CANDIDATE_REQUIRED');
  if (!candidateReviewDecisions.includes(decision))
    throw new Error('INVALID_REVIEW_DECISION');
  const normalizedReason = String(reason ?? '').trim();
  if (normalizedReason.length < 20 || normalizedReason.length > 1200)
    throw new Error('INVALID_REVIEW_REASON');
  const normalizedReviewer = String(reviewer ?? '').trim();
  if (!normalizedReviewer || normalizedReviewer.length > 100)
    throw new Error('INVALID_REVIEWER');
  const timestamp = new Date(decidedAt);
  if (Number.isNaN(timestamp.valueOf())) throw new Error('INVALID_REVIEW_DATE');
  const normalizedDecidedAt = timestamp.toISOString();
  if (normalizedDecidedAt < candidate.discovered_at)
    throw new Error('REVIEW_PRECEDES_CANDIDATE');

  const active = activeCandidateReviews(reviews, candidate.id);
  if (active.length > 1) throw new Error('MULTIPLE_ACTIVE_REVIEWS');
  if (supersedesReviewId) {
    if (active.length !== 1 || active[0].id !== supersedesReviewId)
      throw new Error('SUPERSEDED_REVIEW_IS_NOT_ACTIVE');
  } else if (active.length) {
    throw new Error('ACTIVE_REVIEW_ALREADY_EXISTS');
  }

  const identity = JSON.stringify([
    candidate.id,
    decision,
    normalizedReason,
    normalizedReviewer,
    normalizedDecidedAt,
    supersedesReviewId,
  ]);
  return {
    schema_version: '1.0.0',
    id: `evreview-${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`,
    candidate_id: candidate.id,
    decided_at: normalizedDecidedAt,
    decision,
    reason: normalizedReason,
    reviewer: normalizedReviewer,
    supersedes_review_id: supersedesReviewId,
  };
}
