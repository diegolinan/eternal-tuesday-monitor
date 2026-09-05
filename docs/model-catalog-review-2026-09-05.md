# Initial model catalog review

Reviewed PR #1 against main `d712a96ebce6ad90db17fd21733f38da9e667d51`.
Review date: 2026-09-05 UTC (September 4 in Argentina).

## Acceptance boundary

Accept 115 documented model identities: OpenAI 79, Anthropic 4, Google 31,
and xAI 1. This is a bounded initial catalog, not complete global coverage.
DISCOVERED means documented, not currently available, newly released, or tested.
No account API access has been verified. Unknown release/availability dates
remain unknown. No observation, evidence, result, or consumer-surface mapping
is added or changed by this adoption.

## Fable identity resolution

The existing article's frontier snapshot and reference 24 identify Anthropic
Fable 5.1. The official
[Claude Fable 5.1 model page](https://platform.claude.com/docs/en/models/fable-5-1/overview)
identifies the full name and exact Claude API ID `claude-fable-5-1`.
These resolve the abbreviated catalog identity, not Fable 5 or Mythos 5.1.

Reuse `model-fable-5-1`; preserve its original display label and observation
references. Remove only the unaccepted duplicate
`model-discovered-d3514020ec953fbf4893` from this proposal. The discovery
record retains the full official name, exact API ID, and original provenance.
Future discovery matches that accepted exact API identity to the existing ID.
The initial 9 catalog IDs remain; 110 new IDs are added, for 119 total.
Five of the 115 discoveries now reuse original catalog identities.

## OpenAI endpoint correction

Review found that the model documentation enumerates endpoints even where
unsupported. A plain occurrence of `v1/responses` is not evidence of support.
Remove that inferred endpoint from all 79 pending OpenAI records and change
the adapter to leave endpoints unknown. Parser version 2 prevents recurrence.
Retained provenance version 1 describes the original fetch/parser, not this
manual correction. Pending event hashes are regenerated for corrected models.

The model pages do not consistently expose rollout or lifecycle badges to
the current parser. Accept identity only when those states remain unknown;
do not interpret DISCOVERED as active. For example, Astra documentation has
shown rollout messaging in an indexed rendition that is missing from direct
HTML. Keep API_UNKNOWN rather than invent an access confirmation.
Do not infer release dates or promote unknown status from naming.

## Review method and limits

Check normalized exact IDs, duplicate identities, configured source domains,
provenance completeness, review flags, schemas, and deterministic projection.
Cross-check the curated provider indexes and Fable's official model page.
All four indexes returned HTTP 200; each of the 115 candidate IDs or exact
display names was present in its provider index during this review.
Original source hashes remain in the proposal; this review does not claim
to have independently retrieved every individual model page a second time.
Three original page-format failures and missing optional API credentials
remain documented source limitations, not negative discovery results.

The pending proposal is corrected before first acceptance. The accepted
append-only ledgers on main and all release files are preserved byte-for-byte.
After merge, corrections must append events instead of rewriting this history.
Paid execution remains disabled, with zero permitted runs/tokens and no
approved executable methodology. The OpenAI prototype is untouched.

## Validation before merge

37 tests passed, including regression checks for endpoint-list contamination
and reuse of a reviewed abbreviated identity on the next discovery.
JSON Schema, referential integrity, append-only comparison against main,
deterministic compilation, lint, Pages build, HTML article/four figures/captions/
repository-prefix validation, and OpenAI prototype build passed.
`npm audit` reported zero vulnerabilities. The 13 projected observations
compare equal to main, with CURRENT 10 / HISTORICAL 3 unchanged.
