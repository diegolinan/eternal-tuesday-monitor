# Review inbox audit - 2026-11-05

Public GitHub state was checked against the review Worker's actual proposal
classification and file allowlist on 2026-11-05. This is a repository/API audit,
not an observation of an authenticated browser session.

All ten open proposals pass the inbox filter and the detail file allowlist.
They contain thirteen candidate IDs that are not yet on main. The proposals are
#108, #106, #105, #104, #102, #96, #95, #94, #93 and #84. Each adds one candidate
except #93, which adds four. No candidate ID is repeated across these proposals.

## Repeated source requiring reviewer attention

Both #84 and #93 include the source
`https://github.com/anthropics/claude-code/issues/89350` with different IDs:

- #84: `evcand-15f82abbf2a32c3d7f627c38`
- #93: `evcand-16e46adbca865e8eada400bf`

This flags a repeated URL, not an automatic evidence decision. In particular,
#93 contains three other candidates. Closing that entire proposal as a duplicate
would also remove those candidates from its pending batch.

## Validation lookup defect

All ten proposal responses carried base snapshots older than current main.
Validation dispatch already uses the current main commit, but the result lookup
used the proposal's old base SHA. A successful current-main validation could
therefore remain invisible, while an older result could appear current.

The lookup now uses the exact current-main SHA already obtained for the proposal.
A behavioral regression test exercises old-base results, a running current
validation, current success, mismatched proposal heads, and a subsequent main
change. Neither candidate data nor review decisions are changed by this fix.
