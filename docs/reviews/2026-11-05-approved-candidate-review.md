# Approved candidate review - 2026-11-05

The user approved the source-by-source recommendations in the project conversation.
Codex prepared the records; the reviewer field states that approval explicitly.
This is candidate triage, not source promotion or a behavioral test.

Thirteen original candidate records from ten PRs are preserved unchanged and
receive decisions: seven DUPLICATE, three REJECTED_IRRELEVANT, two
RETAINED_AS_RESEARCH and one NEEDS_MORE_INFORMATION. The already incorporated
TRACE candidate additionally receives RETAINED_AS_RESEARCH, for fourteen reviews
in total. No prior review is overwritten, no candidate batch is retracted, and
no supporting evidence, product association or PASS/FAIL is created.

| PR | Candidate | Recommendation recorded | Source |
| --- | --- | --- | --- |
| #108 | evcand-84902d81be48d59c25d0b4fe | DUPLICATE | [Original source](https://github.com/anthropics/claude-code/issues/93024) |
| #106 | evcand-82f6285cf6900280722985c7 | DUPLICATE | [Original source](https://github.com/anthropics/claude-code/issues/83789) |
| #105 | evcand-7ef9a2664af273676c81a838 | RETAINED_AS_RESEARCH | [Original source](https://doi.org/10.68050/jams.2026.763) |
| #104 | evcand-ff55cefe5f9b741cbfa2c6ee | REJECTED_IRRELEVANT | [Original source](https://doi.org/10.25172/slrf.79.1.8) |
| #102 | evcand-587c2efc724ea83a405c13d6 | RETAINED_AS_RESEARCH | [Original source](https://doi.org/10.66977/xsci.2610.001o) |
| #96 | evcand-141f6c8749827de67db0cdf1 | REJECTED_IRRELEVANT | [Original source](https://github.com/anthropics/claude-code/issues/103180) |
| #95 | evcand-9899d2d71b5e4a73a1d76f89 | DUPLICATE | [Original source](https://github.com/anthropics/claude-code/issues/87455) |
| #94 | evcand-124356a04c5d63504aa0f0db | REJECTED_IRRELEVANT | [Original source](https://doi.org/10.3389/fonc.2026.1885312) |
| #93 | evcand-16e46adbca865e8eada400bf | DUPLICATE | [Original source](https://github.com/anthropics/claude-code/issues/89350) |
| #93 | evcand-49190c6426d007fffed68136 | DUPLICATE | [Original source](https://github.com/anthropics/claude-code/issues/95812) |
| #93 | evcand-7bb6f8f36ddfa6a663bb8bd2 | DUPLICATE | [Original source](https://github.com/anthropics/claude-code/issues/91224) |
| #93 | evcand-e50c723a4cb1f0fd3a3970ff | DUPLICATE | [Original source](https://arxiv.org/abs/2609.33517) |
| #84 | evcand-15f82abbf2a32c3d7f627c38 | NEEDS_MORE_INFORMATION | [Original source](https://github.com/anthropics/claude-code/issues/89350) |

## TRACE existing record

`evcand-4b3d3f9320db3e684a300e44` is retained as research.
The proposed duplicate `evcand-e50c723a4cb1f0fd3a3970ff` is not treated as
another independent study. The active previously reviewed midnight-rollover
record is used as the duplicate target rather than its invalidated early copy.

## Decision rationale

### evcand-84902d81be48d59c25d0b4fe

DUPLICATE: Same source as incorporated candidate evcand-284384ca1ea42238e72af2a2, already reviewed NEEDS_MORE_INFORMATION. The current report still lacks an exact model and retained execution trace. A new screening-policy ID does not constitute a new evidentiary contribution.

### evcand-82f6285cf6900280722985c7

DUPLICATE: Same source as evcand-77d1780bfce3d9384ae3d724, already classified REQUIRES_BEHAVIORAL_REPRODUCTION. Later discussion does not supply a controlled reproduction. Preserve the existing record and its decision rather than count the source again.

### evcand-7ef9a2664af273676c81a838

RETAINED_AS_RESEARCH: Verified publisher and Crossref metadata identify Kwan Hong Tan and the IBCC transaction protocol (10.68050/jams.2026.763). Retain as methodological context for act-time state freshness and revalidation. This review checked the publisher abstract and metadata, not the complete proof or implementation. Synthetic controls and a SQLite adapter do not establish behavior of a monitored consumer product or any PASS/FAIL.

### evcand-ff55cefe5f9b741cbfa2c6ee

REJECTED_IRRELEVANT: The publisher identifies a personal essay defending AI-assisted legal scholarship. It does not evaluate temporal anchoring, elapsed-time handling, revalidation, state reconciliation or historical validity. A productivity anecdote and a keyword match do not establish relevance to a Monitor probe.

### evcand-587c2efc724ea83a405c13d6

RETAINED_AS_RESEARCH: Retain the XSci preprint as adjacent research on memory poisoning, source authority and action-time enforcement. Its constructed tool-use security experiments are not an elapsed-time evaluation; the phrase weeks later is not evidence for that probe. Inferred Gemini product tags do not establish behavior of the Gemini app. No supporting source, product association, observation or behavioral verdict is accepted.

### evcand-141f6c8749827de67db0cdf1

REJECTED_IRRELEVANT: The report describes broad failures of instruction following, scope control and task completion across sessions. It does not isolate a temporal-validity event or provide a sufficiently scoped test of the five Monitor probes. Mentioning prior sessions alone does not establish historical-validity evidence.

### evcand-9899d2d71b5e4a73a1d76f89

DUPLICATE: Same source as evcand-fd0e482df5e7229b1cb88f71, already reviewed NEEDS_MORE_INFORMATION. The later closure was for inactivity, not a confirmed fix, and does not provide an exact model or new execution artifact. Preserve the original review.

### evcand-124356a04c5d63504aa0f0db

REJECTED_IRRELEVANT: The publisher verifies a review of AI in anticancer drug discovery and precision oncology. It does not evaluate temporal continuity of an AI assistant or any Monitor probe. Current evidence is a generic research phrase here, not a measured revalidation capability.

### evcand-16e46adbca865e8eada400bf

DUPLICATE: Same source and report as evcand-15f82abbf2a32c3d7f627c38 from PR #84, retained in this consolidated review as NEEDS_MORE_INFORMATION. The ETM-EVIDENCE-1.5 screening ID does not add an independent report beyond the ETM-EVIDENCE-1.4 candidate.

### evcand-49190c6426d007fffed68136

DUPLICATE: Same source as the active incorporated candidate evcand-d23d5dd9a4ad9c6ca9e5b04a. The issue still contains a short stale-PR-memory complaint without a model or reproduction steps; its closure requests reproduction rather than confirming a fix. Review the existing candidate instead of adding another copy.

### evcand-7bb6f8f36ddfa6a663bb8bd2

DUPLICATE: Same midnight-rollover source as active candidate evcand-c894d2c8a57c50f1c3db87ca, already reviewed REQUIRES_BEHAVIORAL_REPRODUCTION. Preserve that scoped decision. Subsequent discussion links related cases but is not a controlled reproduction of this event; the separately retracted early-batch copy is not used as the duplicate target.

### evcand-e50c723a4cb1f0fd3a3970ff

DUPLICATE: Same TRACE v1 paper as incorporated candidate evcand-4b3d3f9320db3e684a300e44. Retain and review that canonical candidate as research; a new candidate ID from a later discovery policy does not add an independent study.

### evcand-15f82abbf2a32c3d7f627c38

NEEDS_MORE_INFORMATION: The original issue and attached SESSION_REPORT.md describe existing database outputs presented as fresh tests. The report identifies Claude Code 2.1.241 on Windows but no exact model. The attachment is a narrative summary, not independently retained request/tool traces proving new versus cached executions. Keep the lead pending exact model, authentication/surface clarification and verifiable run artifacts; infer neither deception as a mechanism nor a behavioral PASS/FAIL.

### evcand-4b3d3f9320db3e684a300e44

RETAINED_AS_RESEARCH: TRACE v1 directly studies admitting still-valid memory and rejecting stale memory when an agent returns to changed shared state. Retain as research context for revalidation and state reconciliation. The paper uses constructed return episodes and a derived benchmark, with checkpoint/provenance assumptions and weaker results over longer absences. Its wrapped actor experiments do not establish that Gemini or another consumer product natively solves these probes. No product association or PASS/FAIL is created.

## Preventing recurrence

Discovery and staging now compare normalized source URLs with incorporated
non-retracted candidates, regardless of screening-policy IDs or review outcome.
Staging rechecks the current ledger so an older discovery artifact cannot bypass
the guard. A single batch also keeps only one normalized URL. Source-less
firsthand reports remain distinct. URLs present only in a pipeline-retracted
batch may be rediscovered under corrected screening, while retired record IDs
are never revived. Official change-feed pages retain ID-based checking because
the same page can publish genuinely new capability claims.

A new discussion or correction on an already registered source should be reviewed
against the existing record rather than silently counted as an independent lead.
The original ten proposal branches can be closed only after this consolidated
review is merged and their exact recorded heads remain unchanged.
