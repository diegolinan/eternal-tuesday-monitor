# Operating the Monitor

## What runs automatically

GitHub Actions is the only scheduler. Every day at 12:43 UTC (09:43 Argentina), `Discover official model changes` reads the allowlisted official provider sources. It does not call a model API and cannot create PASS or FAIL.

- No semantic change: the source report and raw snapshots remain as a 90-day Actions artifact. There is no commit and no deployment.
- Deterministic new identity: the accepted catalog event and public changelog entry are committed to `main`; the same run deploys Pages.
- Ambiguous identity or metadata: a normal pull request is opened or updated and review is requested from `diegolinan`. It never auto-merges.
- Newly relevant model without behavioral evidence: the evaluation register shows TEST_REQUIRED and GitHub opens an issue assigned to `diegolinan` with the manual workflow link.
- Workflow failure: GitHub opens or updates one failure issue assigned to `diegolinan`. An operational failure is never a behavioral FAIL.

The public status panel reads GitHub's public workflow API. It shows the last attempt, last success and the next scheduled attempt with a live countdown. The next time is an estimate: GitHub may delay a scheduled job.

## Email notifications

Pull-request review requests and assigned issues use GitHub's own notifications. In the GitHub account's **Settings → Notifications**, enable email for **Participating and @mentions**. Ensure the repository is not ignored; watching **All Activity** is optional if broader repository mail is desired. GitHub—not this application—delivers and manages those emails.

## Running all five probes

Open **Actions → Run five probes for one model → Run workflow**. Supply the exact catalog model ID and its exact OpenAI API ID, type `PROVIDER_API_ONLY`, type `RUN_FIVE_PROBES`, and choose an accepted estimate no greater than USD 0.50. Then approve the protected `model-evaluation` environment when GitHub asks.

Before first use, configure the repository environment **Settings → Environments → model-evaluation** with `diegolinan` as required reviewer and add `OPENAI_API_KEY` as an environment secret. OpenAI API billing is separate from ChatGPT Business or Codex credits.

The job makes one metadata request and up to eight inference requests, stores raw requests/responses as a private 90-day workflow artifact, calculates five deterministic scoped results, validates and builds the candidate, and opens a non-draft pull request requesting review from `diegolinan`. It never pushes evaluation results directly to `main` and never auto-merges.

## Accepting PASS or FAIL

The machine applies the exact oracle in [the V1 protocol](probe-evaluation-v1.md). The reviewer does not choose a favorable label. The reviewer checks that:

1. the requested and returned model IDs are exact;
2. the run completed without credential, access, transport or parsing errors;
3. each machine signal corresponds to the documented oracle;
4. the surface is the OpenAI API only;
5. the limitations accurately prevent transfer to ChatGPT, Codex or other products.

Merge the PR only when those five checks hold. Close it when the evidence should not be published. If execution failed, the record must remain OPERATIONAL_ERROR rather than FAIL. If the completed evidence cannot decide the oracle, it must be INCONCLUSIVE. A merged API PASS does not prove that a consumer product solved the problem.

## Publication cycle

Merging a review PR changes `main`. Validation then checks schemas, referential integrity, append-only history, deterministic compilation, tests, lint and the static Pages build. The Pages workflow publishes the validated result. The public changelog shows only model/evidence/observation events, never code changes. The historical OpenAI-hosted prototype is not part of this cycle and remains untouched.

No discovery, probe, validation, merge or deployment depends on this Codex task or runs from the user's computer.
