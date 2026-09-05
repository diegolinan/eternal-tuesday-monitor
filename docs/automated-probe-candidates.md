# Review-gated automated probe candidates

This workflow closes the mechanical gap between a bounded API test and a human-reviewable proposal without making the test result canonical.

## Fixed scope

- Provider: OpenAI.
- Model: `gpt-5.4-mini`.
- Surface: `surface-openai-model-api`.
- Protocol: `temporal-anchor-explicit-offset-pilot-1`.
- Three invocations per run, no retries.
- Maximum 16,384 input tokens and 256 output tokens per invocation.
- Maximum estimated run cost: USD 1. The estimate is a guard, not an invoice or guaranteed provider-side spend cap.
- At most one scheduled run per day; the installed cadence is weekly on Tuesday at 14:17 UTC and manual dispatch is also available.

`config/automated-probe-candidate.json` is the reviewed switch and contract. `execution_enabled` is currently `false`. In that state, the workflow writes a disabled run report and stops before credential validation or any network request. The local `.env.local` key is not uploaded; a future live GitHub Actions run requires an `OPENAI_API_KEY` repository secret and active API billing.

Live execution also refuses to start if the protocol's pricing check is more than seven days old. Enabling the switch therefore requires reviewing current pricing and updating its dated source, not merely changing a Boolean.

## Review boundary

A completed run retains only the exact cases, deterministic scores, token counts, conservative cost estimate, model identity and request/response hashes. Raw provider responses, request IDs, headers and credentials are excluded from the artifact and PR.

The second workflow job runs only when all three invocations complete. It validates the candidate, stages it under `data/evidence-candidates/`, runs the repository test/build suite and opens or updates a draft PR. That directory is non-canonical: its files are proposals and are not read by the Monitor compiler.

The workflow has no automatic merge, acceptance or publication step. Reviewing or even merging a candidate file does not create an evidence record or observation. Promotion to canonical data requires a separate maintainer-reviewed change under the normal append-only and release rules.

## Safe local checks

```powershell
npm run probes:auto:plan
npm run probes:auto:fixture
npm run probes:auto:verify -- .probe-candidates/fixture.json
```

The fixture exercises the complete scoring and sanitization path without loading `.env.local`, spending API credits or using the network. Live automated execution is CI-only and remains disabled until the policy is explicitly changed.
