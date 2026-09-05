# Model discovery-to-evaluation lifecycle

The Monitor keeps catalog existence separate from empirical observations. An
accepted discovery can therefore be public without receiving a PASS or FAIL.

## Public states

- `DISCOVERED`: accepted model identity exists, but evaluation availability is
  unknown and/or requires review.
- `EVALUATION_AVAILABLE`: an exact API identity, fresh confirmed account access,
  documented compatibility and an approved provider methodology all match. This
  does not enable execution.
- `EVALUATION_PENDING`: a reviewable evaluation candidate exists. Production has
  no such candidate today; the state is fixture-tested.
- `EVALUATION_NOT_POSSIBLE`: a mechanical current blocker is known, such as a
  pending API rollout, denied access, retired lifecycle, denied model, or a known
  API surface for which no approved compatible methodology exists.
- `TESTED`: at least one accepted controlled or reproduced observation exists for
  the exact model and the actual recorded surface.
- `RETEST_REQUIRED`: accepted empirical evidence exists but its current
  sufficiency evaluation requires another test. Historical evidence is retained.

Testability is separately `AVAILABLE`, `NOT_CURRENTLY_AVAILABLE`, or
`UNKNOWN_REVIEW_REQUIRED`. This prevents `DISCOVERED` from pretending that an
evaluation is possible.

The five probe coverage fields are `NOT_TESTED`, `TESTED`, or `RETEST_REQUIRED`.
They are coverage states, not behavior verdicts.

## Surface boundary

Provider API targets are emitted only as `PROVIDER_API`. Consumer-product
surfaces appear on a model only when an accepted empirical observation names
that exact surface. API availability never creates a ChatGPT, Claude, Gemini,
Cursor, or other product-surface mapping.

## Relevance and supersession

Catalog relevance is explicitly `UNCLASSIFIED`, `ACTIVE`, `FRONTIER`,
`HISTORICAL`, or `SUPERSEDED`. Every state except `UNCLASSIFIED` requires a dated
review record and rationale. No name or version heuristic is allowed.

A supersession relationship requires a `REVIEWED_ACCEPTED` catalog review before
it can create a model state event. Product adoption remains a separate evidence
question; a new API release cannot invalidate consumer-product observations.

## Public UX

The default “Evidence focus” shows tested, retest, evaluation-ready, pending, or
explicitly reviewed active/frontier models. “All known models”, vendor filtering,
and text/API-ID search expose the wider accepted catalog without presenting 119
entries at once. At most 24 matching cards render at a time.

## Candidate classes reserved for later work

The broader architecture reserves `MODEL_RELEASE_CANDIDATE`,
`PRODUCT_CHANGE_CANDIDATE`, `VENDOR_CLAIM_CANDIDATE`,
`RESEARCH_EVIDENCE_CANDIDATE`, `USER_REPORT_CANDIDATE`, and
`BENCHMARK_RELEASE_CANDIDATE`. Only structured model release discovery is
implemented now. A future LLM classifier may annotate unstructured candidates as
proposed/review-required, but can never be provenance, factual authority,
accepted evidence, or a behavior verdict.

## Current execution and cost boundary

There are zero approved executable provider methodologies in
`config/probe-execution-policy.json`, so no newly discovered model can run
automatically. The separate dormant API-candidate prototype remains disabled and
fixed to OpenAI `gpt-5.4-mini`, the Model API surface, one Temporal Anchor run,
three invocations, no retries, up to 16,384 input and 256 output tokens per
invocation, at most one run per day, and a conservative USD 1 run guard. It would
require `OPENAI_API_KEY`, active API billing, a fresh reviewed price record, and
explicit activation. The guard is not a provider invoice cap. This phase proposes
and enables zero paid calls.

## Replay evidence quality

The pre-PR #1 catalog state is preserved from Git history. Raw HTTP response
bodies from the original Astra discovery were not committed; only URLs and
SHA-256 hashes were retained. The automated acceptance test is therefore labeled
a **parser replay of the accepted normalized fact**, not a historical raw-source
replay. It proves deterministic identity, deduplication, provenance retention,
no observation creation, and no PASS/FAIL creation. A second synthetic arbitrary
model exercises the same generic path.
