import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { activeCandidateReviews, buildCandidateReview } from './review.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const ledgerPath = path.join(root, 'data/evidence-discovery/reviews.jsonl');
const readLines = async (relativePath, optional = false) => {
  try {
    return (await readFile(path.join(root, relativePath), 'utf8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .map(JSON.parse);
  } catch (error) {
    if (optional && error.code === 'ENOENT') return [];
    throw error;
  }
};
const markdown = (value) =>
  String(value ?? '').replace(/([\\`*_{}[\]()<>#+.!|~-])/g, '\\$1');

const candidateId = process.env.CANDIDATE_ID?.trim();
const decision = process.env.REVIEW_DECISION?.trim();
const reason = process.env.REVIEW_REASON?.trim();
const reviewer = process.env.REVIEWER?.trim();
const decidedAt = process.env.REVIEWED_AT?.trim() || new Date().toISOString();
const supersedesReviewId = process.env.SUPERSEDES_REVIEW_ID?.trim() || null;
const [candidates, batchDecisions, reviews] = await Promise.all([
  readLines('data/evidence-discovery/candidates.jsonl'),
  readLines('data/evidence-discovery/decisions.jsonl', true),
  readLines('data/evidence-discovery/reviews.jsonl', true),
]);
const candidate = candidates.find((item) => item.id === candidateId);
if (!candidate) throw new Error('UNKNOWN_CANDIDATE');
if (
  batchDecisions.some(
    (item) =>
      item.decision === 'RETRACTED_PIPELINE_DEFECT' &&
      item.candidate_batch_generated_at === candidate.discovered_at,
  )
)
  throw new Error('CANDIDATE_BATCH_RETRACTED');

const review = buildCandidateReview({
  candidate,
  decision,
  reason,
  reviewer,
  decidedAt,
  supersedesReviewId,
  reviews,
});
await writeFile(
  ledgerPath,
  `${[...reviews, review].map((item) => JSON.stringify(item)).join('\n')}\n`,
);

const currentBefore = activeCandidateReviews(reviews, candidate.id)[0] ?? null;
const body = `## Evidence-candidate decision

- **Candidate:** \`${markdown(candidate.id)}\`
- **Decision:** **${markdown(review.decision)}**
- **Reviewer:** \`${markdown(review.reviewer)}\`
- **Decided at:** ${markdown(review.decided_at)}
- **Supersedes:** ${currentBefore ? `\`${markdown(currentBefore.id)}\`` : 'none'}
- **Source:** ${candidate.source_url ?? 'No public source supplied'}

### Reason

${markdown(review.reason)}

This decision is append-only. It does not edit the candidate, create accepted evidence, add an observation, or establish PASS or FAIL.

### Merge check

- [ ] The source and candidate identity were independently checked.
- [ ] The reason supports the selected decision.
- [ ] Uncertainty and scope limits remain explicit.
- [ ] If this supersedes a prior decision, the referenced decision is the current active one.
`;
await writeFile(path.join(root, '.evidence-review-pr-body.md'), body);
console.log(`Prepared ${review.id} for ${candidate.id}.`);
