# Manual Codex pilot (local ChatGPT authentication)

Status: one explicitly authorized live pilot completed on 2026-09-05 and was
manually reviewed for release. The three trials matched their deterministic
expected answers. A separate recurring wrapper now reuses this protocol for
weekly pending-review candidates; automatic evidence acceptance remains disabled.

This is a separate experimental surface, `experimental-codex-cli-chatgpt-local`,
not `surface-openai-model-api` or the consumer ChatGPT UI. Its accepted result is
recorded under the dedicated `surface-codex-cli-chatgpt-local` catalog surface.
The previous API pilot, consumed budget receipts and
raw error evidence are preserved. The earlier standalone connectivity check is
not a temporal observation or a result produced by this adapter.

## What it measures

Protocol `codex-cli-explicit-offset-manual-1` reuses only the deterministic UTC
oracle and three fixed offsets (0, +14, -12) from the manual API protocol. One
host UTC timestamp is supplied explicitly to three fresh `codex exec` sessions.
It measures interpretation of supplied context, not an autonomous clock,
persistence or elapsed-time awareness. The host clock is not independently certified.

The operator approves an exact requested model, native CLI binary SHA-256, CLI
version and implementation hash. No automatic model selection or substitution.
CLI JSONL does not establish the returned model snapshot; `returnedModel` remains
null. A requested model is not proof of backend identity or catalog availability.
The built-in CLI instructions, possible workspace policy and installed skill
descriptions can add context. This is not a bare-model benchmark and the adapter
does not claim complete control of system prompts or provider retention.

## Safety and limits

- Manual-only CLI, default action is an offline plan; LIVE refuses CI.
- Requires separate explicit human approval valid for at most 24 hours. Approval
  must acknowledge `acceptUncappedWorkspaceUsage: true`. **The API US$1 approval
  does not authorize this billing channel.** This record is not a digital signature.
- At most three sequential CLI inference invocations; no harness retries. A
  consumed `.probes/codex/manual-run.lock` blocks further runs across approval IDs.
  It is local to this checkout, not a distributed limit. Never automatically
  delete, rotate or refund it after failure. New spending requires reconciliation
  and renewed human approval.
- Each invocation has a 60-second timeout and 256 KiB combined captured-output
  ceiling. Kill switch `ETM_PROBES_KILL_SWITCH=1` is checked before each invocation
  and polled during the process. Process termination cannot recall provider work.
- More than 32,000 reported input tokens or 512 output tokens stops later cases.
  These are **post-response stop thresholds**, not generation caps. The CLI may
  make internal network retries. Invocation limits do not prove a request count.
- No reliable dollar/credit cap or per-run credit receipt is available here.
  Costs and charged credits stay null, never zero. Do not estimate Business credits
  using API token prices. If a hard monetary cap is required, do not run this adapter.
- Saved ChatGPT login only. API keys, access-token overrides, provider URL overrides
  and unrelated environment variables are not inherited. No `.env.local` loading,
  credential creation, auth-file copying or secret inspection.
- An empty temporary working directory holds only the answer schema. Read-only
  sandbox, ignored user config, disabled shell, web search, apps, remote plugins,
  hooks, memories, goals and delegation. Managed policy is not bypassed. Unexpected
  tool or error events abort the run and invalidate behavioral scoring. This is
  defense in depth, not proof that arbitrary administrator/CLI code is isolated.

All raw JSONL/stderr captures, prompts, attempts and local identifiers stay under
ignored `.probes/codex/`, outside public assets and Git. Credentials are defensively
redacted in captures; redacted output is not scored. The accepted release includes
a sanitized receipt with outcomes, usage and hashes, but not the raw captures.
Hashes demonstrate consistency, not authenticity. New runs remain `PENDING_REVIEW`
until separately accepted, with explicit LIVE/FIXTURE mode.
MATCH/MISMATCH require one complete structured answer; malformed, interrupted,
tool-assisted or otherwise unrecognized output is INCONCLUSIVE, not public FAIL.

## Operator workflow

1. Run `npm run probes:codex:plan`. It performs no network calls or key loading.
2. Review model availability, exact CLI version/binary and the limitations above.
   Obtain human authorization for this separate non-monetarily-capped manual run.
3. Store an approval matching `schemas/codex-pilot-approval.schema.json` under
   `.probes/codex/`. Never generate consent or change an existing receipt silently.
4. Execute only from a trusted local machine using its existing ChatGPT login:

```powershell
npm run probes:codex:pilot -- --approval .probes/codex/approval.json --binary "ABSOLUTE_PATH_TO_CODEX_EXECUTABLE"
npm run probes:codex:verify -- .probes/codex/APPROVAL-ID/candidate.json
```

The verifier checks schema, code binding, chronology, preflight, prompt/case
reconstruction, capture hashes and replayed scoring. Keep the matching implementation
when archiving a live run; later changes invalidate verification against current code.
Temporary working directories are not automatically deleted and contain no copied
credentials. They can be reviewed and removed separately.

The recurring wrapper is documented separately in
`docs/scheduled-codex-candidates.md`. It creates a fresh isolated run root and
one UTC-day receipt for every authorized weekly attempt; it never removes or
reuses the original manual receipt.

## Documentation basis

Live pilot result on 2026-09-05: three fresh `gpt-5.6-luna` sessions at low
reasoning effort produced MATCH for UTC offsets 0, +14 and -12. Reported usage
was 23,133 input tokens and 364 output tokens in total, with no harness retries.
The CLI did not report provider-side model identity, charged workspace credits or
monetary cost. The private candidate SHA-256 is preserved in the sanitized receipt.
This establishes supplied-context calendar calculation on this Codex surface only;
it does not establish autonomous clock awareness, elapsed-time awareness or
revalidation behavior.

Checked 2026-09-05: [non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
for JSONL, output schemas, ephemeral sessions and saved login;
[configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
for the explicit local controls. No new dependencies are required.
