# Model Discovery V1

Model Discovery V1 checks allowlisted official vendor sources once per day at 12:43 UTC and can also be started manually. GitHub Actions is the only clock. The routine deterministic path requires neither ChatGPT nor Codex and performs no model inference.

## Source registry

`config/model-discovery.json` is the canonical registry. Each entry declares its vendor, exact URL, source type and role, host allowlist, adapter and parser versions, identity pattern, discovery semantics, limitations, expected instability and whether exact identities from that source may enter automatic acceptance.

| Vendor    | Official source                                       | Structure                    | Adapter          | Discovery rule                                                | Principal limitation                                           |
| --------- | ----------------------------------------------------- | ---------------------------- | ---------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| OpenAI    | `https://developers.openai.com/api/docs/models/all`   | HTML index plus model detail | `openai-docs`    | Detail snapshot section contains the exact allowlisted API ID | Identity does not establish account access or endpoint support |
| Anthropic | `https://platform.claude.com/docs/en/models/overview` | HTML comparison table        | `anthropic-docs` | Official `Claude API ID` row contains an exact allowlisted ID | Does not establish consumer-product adoption                   |
| Google    | `https://ai.google.dev/gemini-api/docs/models?hl=en`  | HTML model table             | `google-docs`    | Official endpoint column contains an exact allowlisted ID     | Does not establish project access or Gemini product adoption   |
| xAI       | `https://docs.x.ai/developers/models`                 | HTML index plus model detail | `xai-docs`       | Detail contains the exact allowlisted Grok API ID             | Non-language model pages fail conservatively                   |

Optional authenticated, read-only model-list endpoints for the same four vendors can establish account-visible identity and declared endpoint metadata. Missing credentials are reported as `CREDENTIAL_NOT_CONFIGURED`; they do not make a model disappear and do not block the unauthenticated documentation adapters. These requests list metadata only and never invoke a model.

Every successful fetch records the final URL, UTC fetch time, response hash, ETag and Last-Modified when supplied, adapter/parser versions and the source Git commit. Raw compressed responses are retained as a 90-day workflow artifact. A source publication date is recorded only when the source explicitly supplies one. A fetch date is never presented as a publication date.

## Three event classes

- `MODEL_DISCOVERED`: a previously unknown stable identity exists.
- `MODEL_METADATA_CHANGED`: an existing identity has changed metadata. It does not become a second model.
- `MODEL_RELATIONSHIP_CHANGED`: a possible replacement or supersession changed. It never propagates staleness without reviewed evidence.

Legacy `MODEL_METADATA_RECORDED` events remain valid historical records.

## Automatic acceptance

A discovery is committed automatically only when all conditions hold:

1. it is a genuinely new identity;
2. every provenance record belongs to an enabled allowlisted official vendor source marked for automatic identity acceptance;
3. the vendor is already canonical;
4. an exact API identifier matches the source contract;
5. deterministic normalization finds no canonical-name, API-ID, alias or batch collision;
6. the adapter reports no identity/source conflict;
7. no rename, replacement, supersession or product adoption is asserted; and
8. the reviewed relevance policy classifies it deterministically as `DISCOVERED_RELEVANT` or `CATALOG_ONLY`.

Automatic acceptance writes catalog and discovery-ledger metadata, rebuilds the Monitor and deploys Pages. It creates no observation and no PASS/FAIL.

## Review required

The workflow creates or updates a draft candidate PR when an exact identity is missing, identities collide, a marketing and API name may refer to the same model, relevance has no deterministic rule, existing metadata changes, a rename or alias is suspected, a replacement relationship appears, or any consumer-product adoption would need interpretation. Source removal is also never treated as deletion or withdrawal; it requires a later explicit policy and review.

## Relevance policy

`config/model-relevance-policy.json` is ordered and reviewable. It does not infer `FRONTIER` from marketing copy or version numbers.

- Specialized audio, realtime, image, speech, embedding, robotics, computer-use, live, translation and search identities become `CATALOG_ONLY`.
- Exact IDs belonging to reviewed general-purpose, reasoning or coding families become `DISCOVERED_RELEVANT`.
- Everything else becomes `REVIEW_REQUIRED`.
- Existing reviewed `ACTIVE`, `FRONTIER`, `HISTORICAL` and `SUPERSEDED` classifications remain human decisions.

The default UI emphasizes tested, retest-required, evaluation-ready/pending and deterministically relevant models. `CATALOG_ONLY` identities remain available through search and the full-catalog view. The headline order prioritizes evidence and pending evaluation; total catalog size is deliberately secondary.

## Failure and evidence boundaries

Each source is isolated. A failed or structurally unexpected adapter contributes no facts, preserves the prior catalog, appears in the workflow summary and does not stop independent sources. An absent model is not deleted, retired or superseded. Repeated identical runs produce no duplicate event.

Discovery and testability remain separate. An API ID does not establish account access, an executable methodology or availability in ChatGPT, Codex, Cursor, Claude Code, Gemini applications or another consumer surface. Every newly tracked untested model receives the five existing probe entries as `NOT_TESTED` and the public label `NO VERDICT IMPLIED`.

Broader release-note, research, benchmark, issue, Cursor and general web discovery remains outside V1.
