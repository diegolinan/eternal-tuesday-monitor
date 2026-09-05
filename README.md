# The Eternal Tuesday Monitor

## Model discovery and reviewed adoption (Phase 6)

The public model register and the observation table answer different questions. A model can exist, have a documented API identifier, be listed for an account, be compatible with an approved API protocol, and have accepted behavioral evidence. None of those claims implies the next one. No discovered model automatically receives a PASS/FAIL, and no API record updates ChatGPT, Claude, Codex, Cursor or another consumer surface.

`config/model-discovery.json` is the curated discovery source registry. Every source specifies its vendor, adapter/version, authority, URL, enabled flag, cadence, identity pattern, allowed domains and availability semantics. The supported strategies are:

| Vendor    | Public discovery                                                                                                                                                            | Optional authenticated GET                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI    | [Official model index](https://developers.openai.com/api/docs/models/all), then same-domain model pages; exact IDs must occur in documented snapshots, not just a URL slug. | `/v1/models`; listing alone does not expose all endpoint/capability constraints.                                                 |
| Anthropic | [Model comparison](https://platform.claude.com/docs/en/models/overview), reading the Claude API ID row rather than Bedrock IDs.                                             | [Models API](https://platform.claude.com/docs/en/api/models/list), including pagination and explicit capabilities where exposed. |
| Google    | [Gemini model tables](https://ai.google.dev/gemini-api/docs/models?hl=en), reading exact endpoint cells.                                                                    | [Models API](https://ai.google.dev/api/models), including pagination and supported generation methods.                           |
| xAI       | [Model index](https://docs.x.ai/developers/models), then same-domain pages; exact identifiers must be present in page content.                                              | [Model listing](https://docs.x.ai/developers/rest-api-reference/inference/models).                                               |

HTML adapters use parse5, never execute downloaded scripts, and fail visibly when expected structures disappear. This is bounded official-document retrieval, not arbitrary crawling. Public documentation confirms only what it says; the system does not infer a release date from a model name, URL, crawl timestamp or API `created` timestamp. Unknown family, version, release date and alias relationships remain null/empty. Documentation can establish an exact ID while API usability remains UNKNOWN or PENDING. Only a successful authenticated listing establishes account-visible API availability, not successful generation.

### Lifecycle and identity

The separate append-only ledger `data/model-discovery/events.jsonl` records snapshots of reviewed metadata with `discovered_on`, `released_on`, `api_available_on`, account-check date, source URLs, retrieval dates, content hashes and parser versions. Initial events reach canonical data only after a maintainer merges the generated PR. First discovery dates from an open proposal are retained by reading its data file without executing its branch code. Existing model records and prior metadata events are never deleted.

- Release state: DISCOVERED means official identity found; RELEASED requires additional release/listing evidence; DEPRECATED/RETIRED require an explicit vendor statement; SUPERSEDED requires an explicit relationship. Absence from a later listing is not retirement.
- API state: API_UNKNOWN, API_PENDING or API_AVAILABLE. A documented ID can coexist with UNKNOWN/PENDING. Account access is separate: UNKNOWN, ACCESS_CONFIRMED, ACCESS_DENIED or ERROR. A denied request is never global nonexistence.
- Readiness: PROBE_ELIGIBLE requires approved provider/methodology, a non-denied exact ID, sufficiently recent account access, and every required endpoint, capability and parameter established. HARNESS_UNSUPPORTED identifies an available API model lacking a compatible approved contract; otherwise readiness is NOT_YET_TESTABLE.
- Evidence: NOT_YET_TESTED or TEST_PENDING never implies failure. TESTED and first/last test dates are derived only from accepted observations for that exact model, approved methodology and explicitly mapped API surface. Metadata events cannot contain fabricated test dates.

Identity resolution first uses vendor plus exact API ID (or explicit alias), then an unambiguous identical display name when one side lacks an API ID. It never synthesizes an API ID. IDs are stable hashes or reuse an exact existing catalog match. Different exact IDs with an identical display name are kept separate and flagged, not silently declared aliases. Possible overlap with an existing abbreviated catalog name also requires review. Conflicting metadata is preserved as a review requirement and blocks probe eligibility. Ambiguous mappings must be resolved before merging a proposal; routine unambiguous additions need no manual JSON plumbing.

Supersession propagates RETEST_REQUIRED only through a reviewed, same-vendor `supersedes_model_id` and the explicit execution-policy switch. Adapters do not infer supersession from a newer version number. Existing immutable observations keep their results. Current-family claims need their own reviewed model/surface mapping.

### Daily workflow and review boundary

`.github/workflows/discover-models.yml` runs daily at 12:43 UTC (09:43 Argentina) and supports `workflow_dispatch`. Once daily is sufficient for release discovery; execution may be delayed by GitHub. The read-only discovery job has no repository write token. The proposal job receives data only, validates it, runs tests and a static build, then opens/updates the draft `automation/model-discovery` PR. It never merges or publishes external facts directly. Changes are restricted to the model catalog, discovery ledger, explicit state events and compiled view. No change means no new commit/PR; source outcomes remain in the run summary/artifact. Reports are retained for 90 days in Actions; accepted discovery provenance is retained permanently in Git.

GitHub must allow Actions to create pull requests (repository Settings > Actions > General > Workflow permissions). The workflow requests contents-write and pull-requests-write only for the proposal job. Default GITHUB_TOKEN-created PRs do not trigger ordinary PR CI automatically, so validation, tests and the Pages build run inside the proposal workflow before PR creation. A maintainer merge triggers normal main CI/Pages. There is no auto-merge configuration. Future automation could accept exact, non-conflicting metadata after demonstrated adapter reliability, but identities, methodology changes, supersession and behavioral conclusions should retain review.

Local commands:

```powershell
npm run models:discover -- --as-of 2026-09-04
# Inspect .discovery/run.json. On a proposal branch only:
npm run models:stage
npm run data:validate -- --base main
npm run data:compile
npm run models:targets -- --as-of 2026-09-07
```

Discovery itself writes only ignored `.discovery/` outputs. `models:stage` prepares the proposed catalog/ledger changes; it is not an acceptance action. `models:targets` regenerates eligible target configuration from accepted data, with no per-model code changes. The Pages pipeline also generates that target artifact after merges.

### Execution and failure policy

`config/probe-execution-policy.json` is separate from discovery. General automated paid execution is disabled, maximum runs and tokens are zero, and no API methodology is approved for automatic evidence acceptance. The separate [manual OpenAI pilot](docs/manual-openai-pilot.md) requires a one-use human approval and saves private, pending-review evidence only. It does not enable the production target list or relabel article-derived observations as newly tested.

The separate [manual Codex pilot](docs/manual-codex-pilot.md) uses local ChatGPT authentication and its own experimental surface, approval and one-use receipt. `npm run probes:codex:plan` is offline by default. Codex usage is not billed or bounded like the API pilot: a live run requires explicit acceptance that dollar/credit caps cannot be enforced here. One reviewed GPT-5.6 Luna result from that adapter was accepted in release `2026-09-08`; this does not schedule Codex execution or automatically accept future evidence.

The [review-gated API candidate flow](docs/automated-probe-candidates.md) is deliberately narrower than general probe execution: one OpenAI API model, one temporal-anchor protocol and three invocations. It is retained as a manual experiment only. Paid execution is disabled in `config/automated-probe-candidate.json`, so dispatches stop before reading the key or making a network request.

The active recurring path is the [scheduled Codex/Business candidate flow](docs/scheduled-codex-candidates.md). Once a week it uses the trusted local ChatGPT workspace login to request exactly three fresh `gpt-5.6-luna` sessions at low effort. A local UTC-day receipt prevents a second run that day. Raw captures remain ignored; a successful run can only push a sanitized candidate branch, which GitHub validates before opening a draft PR. Neither side can merge, accept evidence, append an observation, create a release or publish the Site automatically.

Optional discovery credentials are OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY and XAI_API_KEY in GitHub Secrets. Missing credentials skip authenticated listing, without disabling public discovery. GET requests have timeout, response-size, redirect, pagination and detail-count limits. HTTPS host allowlists are checked at every redirect; authenticated redirects cannot cross origins. Credentials are never placed in URLs, source files, PR text or artifacts. Discovery never calls a generative endpoint. The recurring Codex task uses the local ChatGPT workspace login and never reads API keys.

A failed source creates an adapter outcome, not catalog deletions. Authenticated errors can propose an account-access ERROR/ACCESS_DENIED snapshot while retaining prior identity and availability provenance. Fresh account confirmations are cached for at most seven days to avoid daily renewal-only PRs; failure checks invalidate readiness. The manual API pilot checks account availability, binds approval to exact code/parameters, limits calls and output tokens, reserves estimated spend, and respects its own kill switch. The API candidate harness is fixture-tested but its paid execution gate remains disabled. Scheduled Codex candidates have no reliable monetary cap and therefore retain a strict human review boundary; automatic evidence acceptance is not implemented.

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

Daily model discovery and display-freshness refresh are configured as described above. The OpenAI API candidate workflow is manual-only and execution-disabled. A weekly local Codex/Business task may produce a sanitized draft PR for review. Automated evidence acceptance is not configured.

## Initial evidence scope

Release `2026-09-03` remains the immutable initial evidence release. Release `2026-09-07` is the public launch manifest and intentionally preserves the September 3 evidence cutoff and the same 13 article-derived observations. Release `2026-09-08` adds one separately reviewed, reproduced observation from the manual Codex CLI Luna pilot, bringing the Monitor to 14 observations with a September 5 data cutoff. The supplied article remains unchanged and keeps its September 3 evidence scope; the new result appears in the versioned Monitor dataset rather than being inserted into that historical article.
