# The Eternal Tuesday Monitor

## GitHub-native public-source discovery

The public model register and the observation table answer different questions. Entity discovery, vendor source evidence, and behavioral observation are separate layers. No discovered model automatically receives a PASS/FAIL, and no model identity implies adoption by ChatGPT, Claude, Gemini, Grok, Cursor, or another product surface.

`config/model-discovery.json` is the versioned curated source registry. It contains public official model documentation for OpenAI, Anthropic, Google, and xAI; official product/release sources for those vendors and Cursor; and a bounded public research feed. Every source declares its class, adapter/version, authority, URL, cadence, allowlisted domains, semantics, and limitations.

| Layer | Automatic input | Automatic output |
| --- | --- | --- |
| Entity discovery | Official public model documentation | Exact normalized model identity and immutable discovery event |
| Product/source discovery | Official release notes, changelogs, and system cards | Auditable source check/change signal for review |
| Research discovery | Curated public publication feed | Auditable research candidate signal for review |
| Behavioral observation | Separately reviewed evidence only | Never produced by discovery |

HTML adapters use parse5, never execute downloaded scripts, and fail visibly when expected structures disappear. This is bounded authoritative-source retrieval, not arbitrary crawling or search-result scraping. Public documentation confirms only what it says; unknown release dates, aliases, product mappings, and behavioral claims remain unknown.

### Lifecycle and identity

The append-only ledger `data/model-discovery/events.jsonl` records normalized semantic model changes. `data/model-discovery/source-checks.jsonl` records every source check with URL, source class, adapter/parser versions, timestamp, result/HTTP status, ETag/Last-Modified, current and previous hashes, change flag, extracted identifiers, commit/workflow identity, and parser error. Raw compressed snapshots are short-lived Actions artifacts; metadata and hashes remain versioned.

- Release state: DISCOVERED means official identity found; RELEASED requires additional release/listing evidence; DEPRECATED/RETIRED require an explicit vendor statement; SUPERSEDED requires an explicit relationship. Absence from a later listing is not retirement.
- Public identity never requires an account, provider key, billing account, or successful generation.
- Evaluation status is derived from accepted behavioral observations. A relevant model with no such observation is TEST_REQUIRED and shows NO CURRENT EVIDENCE for every probe.
- Evidence: NOT_YET_TESTED or TEST_PENDING never implies failure. TESTED and first/last test dates are derived only from accepted observations for that exact model, approved methodology and explicitly mapped API surface. Metadata events cannot contain fabricated test dates.

Identity resolution first uses vendor plus exact API ID (or explicit alias), then an unambiguous identical display name when one side lacks an API ID. It never synthesizes an API ID. IDs are stable hashes or reuse an exact existing catalog match. Different exact IDs with an identical display name are kept separate and flagged, not silently declared aliases. Possible overlap with an existing abbreviated catalog name also requires review. Conflicting metadata is preserved as a review requirement and blocks probe eligibility. Ambiguous mappings must be resolved before merging a proposal; routine unambiguous additions need no manual JSON plumbing.

Supersession propagates RETEST_REQUIRED only through a reviewed, same-vendor `supersedes_model_id`. Adapters do not infer supersession from a newer version number. Existing immutable observations keep their results. Current-family claims need their own reviewed model/surface mapping.

### Daily workflow and review boundary

`.github/workflows/discover-models.yml` runs daily at 12:43 UTC (09:43 Argentina) and supports `workflow_dispatch`. Once daily is sufficient for model catalogs. Each vendor source fails independently. After full validation, qualifying deterministic discoveries are committed to `main` and the same run rebuilds/deploys Pages; this is necessary because a normal workflow-token push does not start a second workflow. Ambiguous identities, metadata changes, suspected relationships and unclassified relevance instead open/update the draft `automation/model-discovery` PR. No change means no commit or deployment. Source outcomes and raw compressed snapshots are retained for 90 days in Actions; accepted hashes and normalized provenance remain permanently in Git.

GitHub must allow Actions to create pull requests for the review-required path. There is no auto-merge configuration. Automatic acceptance is limited to a brand-new exact official identity with no collision, relationship, interpretation or unresolved relevance. Existing metadata, aliases, renames, supersession, product adoption, methodologies and behavioral conclusions retain review.

Local commands:

```powershell
npm run models:discover -- --as-of 2026-09-05
# Inspect .discovery/run.json. GitHub Actions stages automatic changes;
# a local proposal branch may stage review-required changes:
npm run models:stage -- --mode review
npm run models:adopt -- --report .discovery/run.json --as-of 2026-09-05
npm run data:validate -- --base main
npm run data:compile
```

Discovery itself writes only ignored `.discovery/` outputs. `models:stage -- --mode automatic` is restricted to GitHub Actions (or a non-main branch) and applies only policy-qualified new identities. Review mode prepares the proposal path.

Accepted discoveries are projected into the public [model lifecycle](docs/model-lifecycle.md) even when no observation exists. The canonical model catalog has its own JSON Schema and keeps API identity, aliases, discovery provenance, reviewed relevance and reviewed supersession explicit. Lifecycle coverage never creates an observation or behavior verdict.

### Evaluation and failure boundary

[`config/model-evaluation-policy.json`](config/model-evaluation-policy.json) is a non-executing boundary: discovery cannot create behavioral verdicts. Newly discovered relevant models enter `data/model-evaluation/adoption.json` as TEST_REQUIRED until separately reviewed evidence exists.

Discovery performs zero provider inference calls and uses no provider credentials. Historical operational test errors remain in the append-only evaluation ledger with zero evidentiary weight and are excluded from the public model state.

`config/probe-execution-policy.json` remains legacy methodology metadata used by lifecycle projection. It is not called by the scheduled workflow and does not authorize inference or automatic evidence acceptance.

The separate [manual Codex pilot](docs/manual-codex-pilot.md) uses local ChatGPT authentication and its own experimental surface, approval and one-use receipt. `npm run probes:codex:plan` is offline by default. Codex usage is not billed or bounded like the API pilot: a live run requires explicit acceptance that dollar/credit caps cannot be enforced here. One reviewed GPT-5.6 Luna result from that adapter was accepted in release `2026-09-08`; this does not schedule Codex execution or automatically accept future evidence.

The former Luna-specific recurring candidate path has been retired. The one reviewed GPT-5.6 Luna observation, its evidence receipt, release manifest and manual reproduction notes remain immutable historical evidence; they no longer imply an active scheduler. GitHub Actions remains the Monitor's only clock.

A failed source creates an explicit source-check error and never deletes accepted catalog state. Other sources continue. Unchanged checks append audit history without duplicating semantic events. Ambiguous metadata and all epistemic interpretations remain reviewable through GitHub pull requests.

The complete acceptance, relevance and failure contract is in [`docs/model-discovery-v1.md`](docs/model-discovery-v1.md).

Known limits: official HTML formats can change; comparisons can disagree with cached documentation; release dates/aliases/supersession are only populated when explicitly established. Source capabilities are not inferred from model families. Metadata approval is not evidence acceptance. Pending catalog models are linked for review, not displayed as accepted public facts.

This repository is the versioned source of truth for **The Eternal Tuesday Monitor**, a dated, evidence-governed record of observable temporal-continuity behavior in AI products.

The first release is derived strictly from the supplied article, _Your AI Lives in an Eternal Tuesday_, and its cited source notes. It does not add new product tests, infer hidden mechanisms, or turn an evidence gap into a failure result.

## Data contract

An observation is a dated claim at a precise coordinate. These fields are intentionally separate:

| Coordinate          | Contract                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Vendor              | Organization responsible for the product or research artifact.                                                   |
| Product             | Named product or benchmark; always references one vendor.                                                        |
| Surface             | Specific interaction or runtime surface; always references one product.                                          |
| Model               | Model identity when known, or an explicit `unknown` / `not-specified` sentinel.                                  |
| Probe               | One of the Monitor's defined black-box diagnostic questions.                                                     |
| Evidence class      | What kind of support the observation has; it is not the result status.                                           |
| Observation date    | When the behavior, document, report, or evidence gap applies. Precision is explicit (`day`, `month`, or `year`). |
| Evidence verified   | The date on which the evidence supporting the observed result was actually verified.                             |
| Source checked      | The date on which a source record was checked. This never implies that product behavior was retested.            |
| Freshness evaluated | The explicit date used to derive current evidentiary sufficiency from policy and state events.                   |
| Published           | The public release or article publication date. It does not rewrite evidence provenance.                         |
| Source              | A separately versioned source record. Sources do not themselves become observations.                             |
| Methodology version | The procedure under which the observation was admitted.                                                          |

The joins are explicit:

```text
vendor -> product -> surface
              model

probe + evidence class + observation date + last verified date
  + methodology version + evidence record -> source record(s)
  = observation
```

No overall product score is part of the contract.

## Repository layout

```text
assets/monitor/                 Canonical supplied visual assets
content/articles/               Canonical supplied article
content/manifest.json           Byte hashes and provenance for supplied content
data/catalog/                   Vendors, products, surfaces, models, probes and statuses
data/methodologies/             Versioned admission and review methods
data/sources/                   Source records, including the supplied article
data/evidence/                  Evidence records connecting claims to sources
data/observations/              Append-only observation ledger (JSON Lines)
data/state-events/              Append-only operational state-event ledger
data/releases/                  Dated release manifests and cutoffs
config/freshness-policy.json    Versioned editorial review windows
schemas/                        JSON Schemas for core record types
scripts/validate-data.mjs       Contract, relationship and chronology validation
scripts/compile-monitor-view.mjs  Deterministic public projection for an explicit date
public/                         Current Site runtime assets and generated data view
app/                            Existing ChatGPT Site source
```

The files under `data/`, `content/`, and `assets/` are authoritative. `public/data/monitor.json` and the copies under `public/assets/` are generated or publication views. The article is rendered directly from its canonical Markdown source at build time; there is no second public Markdown copy.

## Publication targets

The canonical public production site is:

<https://diegolinan.github.io/eternal-tuesday-monitor/>

The repository preserves two separate build targets:

- `npm run build:pages` creates the canonical static GitHub Pages production artifact under `dist/client`, with every internal data, asset, and route URL scoped to `/eternal-tuesday-monitor/`.
- `npm run build:openai` preserves the historical OpenAI Sites prototype build and its `.openai/hosting.json` project link.

The historical OpenAI-hosted prototype remains available at <https://eternal-tuesday-monitor.stella-diego-9071.chatgpt.site/> as an unchanged fallback. It is intentionally not canonical, and the GitHub Pages workflows do not modify, redirect, disable, or redeploy it.

The canonical article source is `content/articles/your-ai-lives-in-an-eternal-tuesday.md`. The `/article/` route parses it as Markdown AST during the static build and resolves its four editorial image placeholders to the versioned visual assets.

## Append-only history and release resolution

`data/observations/observations.jsonl` is an append-only ledger.

- Never edit, delete, or reorder an existing observation line after it has been committed.
- Correct or supersede an observation by appending a new record with `supersedes_observation_id` set to the earlier record's ID.
- Historical records remain addressable. A later result changes operative state; it does not erase what was observed before.
- `CURRENT`, `HISTORICAL`, `RETEST_REQUIRED`, `INCONCLUSIVE`, and `UNTESTED` are record states, not evidence classes.
- `NO_PUBLIC_EVIDENCE` means the article found no qualifying public result by its cutoff. It is not a failed probe.

`data/state-events/events.jsonl` is a separate append-only ledger. It can record a retest requirement, superseded model or methodology, discontinued surface, unavailable source, or restoration of sufficiency without rewriting an observed PASS, FAIL, or evidence gap. Release manifests are also immutable after publication. The current release is resolved deterministically from all manifests by `published_on`, falling back to `data_cutoff`, and then by release ID.

An appended observation with `supersedes_observation_id` makes its predecessor HISTORICAL once the successor's verification date is reached; aging alone never changes applicability. Events apply only when both their effective and recorded dates are at or before the supplied evaluation date. Restoration can clear an explicit or inherited retest flag, but cannot bypass an age, unavailable-source, or lifecycle blocker or rewrite verification dates. A missing verification date is represented as null and requires review, never an invented date. INCONCLUSIVE and UNTESTED qualifiers remain explicit in the public projection.

All linked evidence records contribute notes and supporting sources to the evaluation. The public `sourceCheckedOn` describes the primary linked source only, not an aggregate claim about all sources. Availability is AVAILABLE only when every supporting source has an applicable availability event; an unchecked source remains UNKNOWN. Source checks are not performed by the freshness workflow.

Run the validator against a Git base to enforce the ledger rule in future pull requests:

```powershell
npm run data:validate -- --base origin/main
```

When the base branch predates the normalized ledger, the comparison is intentionally skipped; all other validation still runs.

## Local validation and Site projection

```powershell
npm run data:validate
npm run data:compile
npm test
npm run build:pages
npm run build:openai
```

The validator checks required fields, controlled vocabularies, ID uniqueness, date precision, referential integrity, vendor-product-surface consistency, model/vendor compatibility, evidence/source links, release membership, and result/state invariants. With `--base`, it also rejects modification, deletion, or reordering of existing observation lines.

The compiler creates `public/data/monitor.json` and keeps observed result, applicability, current evidentiary sufficiency, source availability, and all relevant dates separate. It does not change canonical records. For reproducible evaluation at another date:

```powershell
npm run data:compile -- --as-of 2026-10-14
```

### Freshness policy 1.0

Freshness windows are an editorial maintenance policy, not a measure of evidence strength. Evidence remains sufficient through the configured day and requires review only when its age is greater than the threshold.

| Evidence class                | Review window |
| ----------------------------- | ------------: |
| Controlled experiment         |      180 days |
| Reproduced observation        |      120 days |
| Official documentation        |       90 days |
| Vendor evaluation             |       90 days |
| Staff confirmation            |       60 days |
| User / practitioner report    |       60 days |
| Feature request               |       60 days |
| Untested / no public evidence |       30 days |

Longer windows are assigned to direct, repeatable observations because reproducing them is costlier and their test conditions are explicit. Provider-controlled documentation is reviewed quarterly. Reports, confirmations, requests, and evidence gaps receive shorter windows because their public applicability can change without a formal version transition. These values are configurable and require editorial approval when changed.

Derived sufficiency values mean:

- `SUFFICIENT`: the latest applicable record is within policy and has no blocking state event.
- `RETEST_REQUIRED`: the historical result is preserved, but age or a dated lifecycle/provenance event means it should not stand alone as a current claim.
- `NOT_CURRENTLY_APPLICABLE`: the record belongs in evidence history and has no separate retest signal.
- `NO_APPLICABLE_POLICY`: no configured rule matches the evidence class, so the system refuses to claim current sufficiency.

## Publication workflow

The validation workflow:

1. validates the normalized records, including append-only comparison with the target branch;
2. compiles the Site-facing JSON projection;
3. fails if the generated projection differs from the committed file;
4. validates lint and the static article render; and
5. runs deterministic state tests; and
6. builds the GitHub Pages production artifact.

The Pages workflow publishes that validated artifact to the canonical production URL. A separate minimal workflow runs every Monday at 12:17 UTC, 09:17 Argentina time. It supplies an explicit date, reevaluates only local versioned state, rebuilds, and redeploys Pages. It does not fetch sources, change evidence verification dates, modify historical records, or commit derived files. Neither workflow deploys the OpenAI prototype.

Daily official model discovery and display-freshness refresh are configured as described above. The production workflows contain no provider-inference or API-target step. No local ChatGPT/Codex scheduler participates in the canonical path. Automated evidence acceptance is not configured.

## Initial evidence scope

Release `2026-09-03` remains the immutable initial evidence release. Release `2026-09-07` is the public launch manifest and intentionally preserves the September 3 evidence cutoff and the same 13 article-derived observations. Release `2026-09-08` adds one separately reviewed, reproduced observation from the manual Codex CLI Luna pilot, bringing the Monitor to 14 observations with a September 5 data cutoff. The supplied article remains unchanged and keeps its September 3 evidence scope; the new result appears in the versioned Monitor dataset rather than being inserted into that historical article.
