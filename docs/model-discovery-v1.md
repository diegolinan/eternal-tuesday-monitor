# Curated public-source discovery

GitHub Actions runs discovery daily at 12:43 UTC and on manual dispatch. GitHub is the source of truth, GitHub Actions is the execution environment, and GitHub Pages is production. No laptop, local daemon, ChatGPT process, provider account, or paid provider API is part of this path.

## Registry and adapters

`config/model-discovery.json` is the versioned registry. It currently covers:

- official public model documentation for OpenAI, Anthropic, Google/Gemini, and xAI;
- official product/release sources for those vendors and Cursor;
- a bounded public arXiv query for temporal-awareness and temporal-memory research.

Model adapters parse exact identifiers from source-specific structures. Changelog and research adapters perform deterministic public content change detection; those changes are source/evidence candidates, never behavioral verdicts. Unexpected source structure or retrieval failure is recorded explicitly and preserves prior canonical state.

## Audit and dedupe

Every retrieval is recorded in `data/model-discovery/source-checks.jsonl` with the registry ID, URL, vendor, source class, adapter/parser versions, timestamp, result and HTTP status, publication date when explicitly available, ETag, Last-Modified, content hash, previous hash, change flag, extracted entity count, normalized identifiers, commit/workflow identity, and parser error.

Semantic model events use stable hashes of normalized content. Repeated unchanged input creates source-check history but no duplicate model, semantic event, candidate, observation, or verdict.

## Acceptance boundary

An exact, unambiguous official model identity covered by the reviewed relevance rules may be adopted automatically into the model catalog. Aliases, deprecations, replacements, product-surface mappings, release-note interpretation, research relevance, methodologies, and PASS/FAIL remain reviewable GitHub changes.

A newly discovered relevant model is public immediately as an entity with `TEST_REQUIRED` and no current evidence across the five probes. It does not require a fabricated observation. Existing historical observations and CURRENT/HISTORICAL semantics are unchanged.
