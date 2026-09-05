# Scheduled Codex/Business evidence candidates

This is the active recurring path for the temporal-anchor check. It uses the trusted local Codex CLI login and ChatGPT workspace usage rather than the separately billed OpenAI API.

The fixed policy in `config/codex-scheduled-probe.json` authorizes one weekly `gpt-5.6-luna` run at low reasoning effort. Each run contains exactly three fresh, sequential sessions for offsets 0, +14 and -12. A local UTC-day receipt prevents a second run that day. There are no harness retries.

The user explicitly accepts that this channel does not expose a reliable dollar or workspace-credit amount per invocation. Reported input/output tokens are post-response stop thresholds, not provider billing limits. The scheduled task must stop on login, model, tool, timeout, capture, usage or scoring irregularities.

Raw prompts, CLI event streams, stderr, authentication state and local identifiers remain under ignored `.probes/`. Only a sanitized candidate can be staged under `data/evidence-candidates/`. It includes deterministic answers, verdicts, reported usage and hashes, and always remains `PENDING_REVIEW`.

The scheduled task pushes each ready candidate to a dated `automation/codex-probe-candidate-*` branch. GitHub validates that branch and opens a draft PR. Neither the local task nor the GitHub workflow can merge it, accept evidence, append an observation, create a release or deploy the Site. An explicit human-reviewed promotion is still required.

The old OpenAI API candidate workflow remains available only for manual experimentation and has paid execution disabled. This Codex path never reads `OPENAI_API_KEY`.
