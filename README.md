# The Eternal Tuesday Monitor

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
| Evidence verified   | The date on which the evidence supporting the observed result was actually verified.                              |
| Source checked      | The date on which a source record was checked. This never implies that product behavior was retested.              |
| Freshness evaluated | The explicit date used to derive current evidentiary sufficiency from policy and state events.                     |
| Published           | The public release or article publication date. It does not rewrite evidence provenance.                          |
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

No discovery process, external source polling, model API probe, evidence candidate generator, or automated evidence ingestion is configured.

## Initial evidence scope

Release `2026-09-03` remains the immutable initial evidence release. Release `2026-09-07` is the public launch manifest and intentionally preserves the September 3 evidence cutoff and the same 13 article-derived observations. The article source now records its September 7 publication date separately from its September 3 evidence-review date. The repository does not claim those sources or products were independently retested during this migration.
