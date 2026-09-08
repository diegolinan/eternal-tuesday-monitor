# Operating the Monitor

## What runs automatically

GitHub Actions is the only scheduler. Every day at 12:43 UTC (09:43 Argentina), `Discover official model changes` reads the allowlisted official provider sources. It does not call a model API and cannot create PASS or FAIL.

- No semantic change: the source report and raw snapshots remain as a 90-day Actions artifact. There is no commit and no deployment.
- Deterministic new identity: the accepted catalog event and public changelog entry are committed to `main`; the same run deploys Pages.
- Ambiguous identity or metadata: a new pull request is opened for that run and review is requested from `diegolinan`. It never auto-merges and never reuses an older review branch.
- Newly relevant model without behavioral evidence: the evaluation register shows TEST_REQUIRED and GitHub opens an issue assigned to `diegolinan` with the manual workflow link.
- Workflow failure: GitHub opens or updates one failure issue assigned to `diegolinan`. An operational failure is never a behavioral FAIL.

Every public deployment and the weekly freshness pass also synchronize one assigned reminder for accepted records whose deterministic state is `RETEST_REQUIRED`. The reminder lists exact model, surface, probe, applicability and reason. It opens when at least one record is due, updates when the set changes, and closes when none remain. This notification does not execute a probe, assign a retest date, or change evidence.

The deployment compiles a neutral operational snapshot for the public status panel. The browser makes no direct repository API call. It shows the last attempt, last success and the next scheduled attempt with a live countdown. The next time remains an estimate because scheduled execution can be delayed.

## Email notifications

Pull-request review requests and assigned issues use GitHub's own notifications. In the GitHub account's **Settings → Notifications**, enable email for **Participating and @mentions**. Ensure the repository is not ignored; watching **All Activity** is optional if broader repository mail is desired. GitHub—not this application—delivers and manages those emails.

The bounded product backlog is grouped in the `Evidence automation and behavioral reproduction V1` milestone. Human policy and reproduction work remains visible there instead of appearing as an unexplained public-site status.

Run **Actions → Check reviewer email notification → Run workflow** once after changing notification settings. It opens a harmless pull request and requests review from `diegolinan`. Do not merge it. Confirm that the email arrived, close the pull request, then delete its disposable branch. This proves notification delivery without fabricating an evidence lead.

## Reviewing evidence candidates

Each community receipt and each discovery run uses a unique disposable branch. A later lead therefore cannot silently update an older pull request. Every interpretive pull request requests review from `diegolinan`, carries a `review-required` label, and has no auto-merge path.

To record the outcome, open **Actions → Review one evidence candidate → Run workflow**. Supply the exact `evcand-…` ID, one decision, and an evidence-based reason:

- `REJECTED_IRRELEVANT`: the source does not address a Monitor probe.
- `REJECTED_UNVERIFIABLE`: the material cannot be checked sufficiently.
- `DUPLICATE`: the same evidentiary contribution is already represented.
- `NEEDS_MORE_INFORMATION`: the lead may matter but lacks required identity, scope or provenance.
- `ACCEPTED_AS_SUPPORTING_SOURCE`: the source can support an existing evidence record.
- `REQUIRES_BEHAVIORAL_REPRODUCTION`: the claim is relevant but needs a controlled product/model test.

The workflow appends a decision to `data/evidence-discovery/reviews.jsonl` and opens another reviewable pull request. It never edits the original candidate. A correction supplies the current active `evreview-…` ID as `supersedes_review_id`; history remains intact and only one unsuperseded decision may be active.

The 45-candidate initial detector batch remains preserved and batch-retracted. Those records cannot be individually promoted or retrospectively treated as reviewed evidence.

## Promoting an accepted source

Candidate acceptance and canonical evidence are separate gates. After an `ACCEPTED_AS_SUPPORTING_SOURCE` decision is merged, open **Actions → Promote an accepted supporting source → Run workflow**. Supply the accepted candidate and active review IDs, the exact existing evidence record, a new canonical source ID, publisher, provenance class, verification date and scope notes.

The workflow checks that the candidate coordinates are compatible with the existing evidence, adds only the supporting source, rebuilds the public projection and opens a new pull request. It cannot create an observation or change a result status. A `REQUIRES_BEHAVIORAL_REPRODUCTION` decision instead routes to the controlled five-probe workflow below.

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

The review sequence is therefore:

```text
lead -> candidate PR -> append-only decision PR
                         | accepted supporting source -> source-promotion PR
                         | behavioral reproduction    -> five-probe PR
                         | rejected/duplicate/more info -> no canonical evidence change
```

Only a reviewed merge advances a gate. No interpretive pull request auto-merges, and no candidate decision alone changes the public evidence state.

No discovery, probe, validation, merge or deployment depends on this Codex task or runs from the user's computer.
