# Model Evaluation Adoption V1

This phase connects an accepted `DISCOVERED_RELEVANT` identity to the existing probe framework without creating a behavioral result.

## State boundary

The adoption register separates four questions:

1. Is there an exact official model identity?
2. Can the official account-scoped API listing verify that exact identity?
3. Does the documented model surface provide the primitives required by a particular approved probe profile?
4. Does the execution policy authorize requests and spend?

API availability is `AVAILABLE`, `UNAVAILABLE`, `UNKNOWN`, or `AUTH_REQUIRED_TO_VERIFY`. Missing credentials, a transport failure, and an exact ID absent from a successful authenticated listing are distinct results. Public documentation can establish identity, endpoints and declared capabilities, but does not establish account visibility.

Per-probe adoption is `ELIGIBLE`, `BLOCKED`, `NOT_TESTABLE`, or `REVIEW_REQUIRED`. Eligibility requires the exact provider, approved methodology, endpoint, model capabilities, and harness capabilities. A compatible probe remains blocked until API availability is verified. A profile requiring new interpretation or a new evaluator remains review-required.

The public lifecycle continues to derive `TESTED` only from accepted empirical observations. Adoption metadata has no verdict field and cannot create an observation.

## Execution and cost boundary

`config/model-evaluation-policy.json` has independent provider, model allowlist, manual-only, retry, cooldown, concurrency, request and spend controls. In V1:

- eligibility assessment is enabled;
- paid execution is disabled;
- no model is allowlisted for execution;
- scheduled requests, scheduled spend, and runs per model are zero;
- retries are zero.

Therefore discovery can update eligibility without creating a cost loop. Enabling a provider secret alone cannot authorize inference.

## Scheduling

Official discovery remains daily. The same run assesses adoption after deterministic catalog staging. A changed adoption record is compiled and deployed; an unchanged semantic record retains its original assessment date and creates no daily churn. Newly testable models can be marked baseline-ready. Existing tested models remain governed by the freshness/retest policy.

## Provenance and surface boundary

If execution is introduced under a later explicit policy change, the policy requires a private Actions artifact containing exact provider, requested and returned model IDs, API surface and endpoint, timestamp, methodology, messages, parameters, tool definitions, raw response, normalized evaluation, evaluator version, originating discovery event, commit SHA, and operational errors.

An API run can produce only an API-surface evidence candidate. It cannot be projected onto ChatGPT, Claude, Gemini, Grok, Codex, or another consumer product without independent evidence for that surface. Authentication, transport, quota, and rate-limit failures are operational errors, never behavioral FAILs.
