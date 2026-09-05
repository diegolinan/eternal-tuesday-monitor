# Manual OpenAI pilot: explicit temporal anchor

Status: manual experiment only, pending evidence review. No scheduled inference,
automatic PR, canonical observation, public PASS/FAIL or discovery readiness change.
The existing `config/probe-execution-policy.json` continues to disable automated
execution. This separate CLI is a narrow, explicitly authorized manual exception,
not an implementation of that automated policy.

## Protocol 1

`temporal-anchor-explicit-offset-pilot-1` uses exact API ID `gpt-5.4-mini` through
OpenAI Responses on the existing `surface-openai-model-api` surface. The harness
captures its host UTC clock once, then supplies that reference explicitly in three
independent requests with fixed offsets 0, +14 and -12 hours. Expected dates and
English weekdays are computed with UTC arithmetic, not an LLM judge. The host
clock is not an independently certified time source. Offsets are fixed, not IANA
time zones or daylight-saving rules.

This tests interpretation of supplied temporal context. It does **not** establish
an autonomous clock, elapsed-time awareness, persistence, consumer ChatGPT
behavior, or performance for all models/surfaces. Three samples are a pilot, not a
statistical benchmark. Requested and returned model IDs remain separately recorded;
an unexpected returned identity aborts the pilot rather than implying alias support.

Parameters: `reasoning.effort=none`, JSON object text output, 256 maximum output
tokens, standard service tier, no tools, no conversation history, `store=false`.
No system date is read from article metadata or a release cutoff. Requests contain
only the synthetic test prompt, never repository documents or secrets.

MATCH means both requested values match the oracle; MISMATCH means a well-formed
answer differs. Refusal, malformed JSON and incomplete answers are INCONCLUSIVE.
Auth/quota/network failures are operational outcomes, not model failures.

## Approval, cost and safety

The first pilot was authorized by Diego for OpenAI with a total budget of US$1.
An ignored `.probes/approval.json` records that approval, exact implementation hash
and a maximum 24-hour validity window. It is an operator-maintained approval record,
not a cryptographically signed authorization or a provider-side account spend cap.
Never create a replacement approval or remove a consumed receipt without renewed
human approval and reconciliation of any uncertain spend.

The runner performs one GET model-availability check, then at most three sequential
POST requests, with **no retries**. Listing alone is not endpoint compatibility
evidence. An actual successful response establishes only this exact request works.
Redirects are forbidden; the API host and paths are hardcoded; each response is
limited to 256 KiB and each request has a 30-second timeout. `ETM_PROBES_KILL_SWITCH=1`
stops execution before any network and before each new inference request. CI refuses
live execution. An already dispatched request cannot be recalled by the kill switch.

Published prices checked 2026-09-05: US$0.75 per million input tokens and US$4.50
per million output tokens. The fixed ASCII request is bounded to 8,192 bytes;
16,384 input tokens per call are conservatively reserved including framing, plus
256 output tokens. Three calls reserve **US$0.04032** at these rates. Pricing expires
after seven days and must then be reviewed. Actual usage is valued conservatively
at the uncached input rate. Estimates exclude taxes and account-level charges and
are not billing receipts or a global account limit. No other use of this API key is
covered by the pilot's local budget.

A single exclusive `.probes/pilot-spend.lock` is consumed before network access,
even if preflight fails. It prevents concurrent or repeated spending across approval
IDs in this checkout. Do not copy the approval to another checkout: the guard is
local, not a distributed budget service. Unknown usage is not treated as zero and
the reservation is never automatically refunded. Changing code invalidates approval.

## Running and reviewing

`npm run probes:plan` is safe by default: no key loading and no network. It prints
the implementation hash and budget estimate. After explicit approval, a maintainer
creates `.probes/approval.json` matching `schemas/manual-pilot-approval.schema.json`.
The approved key stays in ignored `.env.local` as `OPENAI_API_KEY` (or environment).
Never paste keys in commands, chat, PRs or browser bundles.

```powershell
npm run probes:plan
# Only with an existing, unconsumed human approval:
npm run probes:pilot -- --approval .probes/approval.json
npm run probes:verify -- .probes/APPROVAL-ID/candidate.json
```

All outputs are under ignored `.probes/`, never `public/`. Each attempt is recorded
before sending. Raw response bodies, safe request IDs, HTTP status, request bodies,
timestamps, monotonic duration, usage and deterministic scores are retained locally.
Response bodies are hashed after defensive key redaction, which is explicitly marked.
`store=false` does not promise zero provider-side retention under all policies.

The candidate has `PENDING_REVIEW` and LIVE/FIXTURE labels. The verifier applies JSON
Schemas, checks hashes, reconstructs requests and recomputes scores and cost estimates.
Hashes demonstrate local integrity, not independent authenticity; a person must
review the protocol, source identity, raw evidence, limitations and any redaction.
There is deliberately no import/accept action. Canonical evidence ingestion needs
separate approval and appropriate schema/surface/methodology mapping.

Offline tests use fake transport and a synthetic key, isolated temporary directories
and FIXTURE labeling. They never call the API. Existing CI runs them with `npm test`.
No scheduler or workflow was added or given an inference credential.

References: [model, pricing and reasoning parameters](https://developers.openai.com/api/docs/models/gpt-5.4-mini),
[Responses request contract](https://developers.openai.com/api/reference/typescript/resources/responses/methods/create).
