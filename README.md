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
| Last verified date  | The full date on which the supporting material was last checked for this release.                                |
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
data/releases/                  Dated release manifests and cutoffs
schemas/                        JSON Schemas for core record types
scripts/validate-data.mjs       Contract, relationship and chronology validation
scripts/compile-monitor-view.mjs  Deterministic Site-facing projection
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

## Append-only observation history

`data/observations/observations.jsonl` is an append-only ledger.

- Never edit, delete, or reorder an existing observation line after it has been committed.
- Correct or supersede an observation by appending a new record with `supersedes_observation_id` set to the earlier record's ID.
- Historical records remain addressable. A later result changes operative state; it does not erase what was observed before.
- `CURRENT`, `HISTORICAL`, `RETEST_REQUIRED`, `INCONCLUSIVE`, and `UNTESTED` are record states, not evidence classes.
- `NO_PUBLIC_EVIDENCE` means the article found no qualifying public result by its cutoff. It is not a failed probe.

Run the validator against a Git base to enforce the ledger rule in future pull requests:

```powershell
npm run data:validate -- --base origin/main
```

When the base branch predates the normalized ledger, the comparison is intentionally skipped; all other validation still runs.

## Local validation and Site projection

```powershell
npm run data:validate
npm run data:compile
npm run build
```

The validator checks required fields, controlled vocabularies, ID uniqueness, date precision, referential integrity, vendor-product-surface consistency, model/vendor compatibility, evidence/source links, release membership, and result/state invariants. With `--base`, it also rejects modification, deletion, or reordering of existing observation lines.

The compiler creates the deliberately flattened `public/data/monitor.json` view consumed by the production site. It does not change the canonical normalized records.

## Publication workflow

The validation workflow:

1. validates the normalized records, including append-only comparison with the target branch;
2. compiles the Site-facing JSON projection;
3. fails if the generated projection differs from the committed file;
4. validates lint and the static article render; and
5. builds the GitHub Pages production artifact.

The Pages workflow publishes that validated artifact to the canonical production URL. It does not deploy the OpenAI prototype. No scheduled monitor, discovery process, external fetcher, probe, evidence candidate generator, or other Phase 5 automation is configured.

## Initial evidence scope

Release `2026-09-03` contains the observations already represented in the supplied article and original Site dataset. The article is the admission basis for every initial evidence record; cited public sources are recorded as supporting sources where the article identifies them. The repository does not claim those sources were independently re-tested during this conversion.
