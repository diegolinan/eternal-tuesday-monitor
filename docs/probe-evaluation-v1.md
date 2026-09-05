# Five-probe evaluation protocol V1

The evaluation is manual and can run only in GitHub Actions. Official-source discovery never invokes a model. A person chooses one exact catalog identity, confirms the provider-API scope, accepts the estimated cost ceiling, approves the protected GitHub environment, and then reviews the resulting pull request. Nothing auto-merges.

## Scope matrix

| Probe | What is supplied | PASS oracle | FAIL oracle | Important boundary |
| --- | --- | --- | --- | --- |
| Temporal anchor | One fixed UTC instant in UTC, UTC+14 and UTC-12 | All three calendar dates and weekdays exactly match | Any exact date or weekday differs | Tests explicit-offset reasoning, not clock access |
| Elapsed | Two fixed timestamps 150 minutes apart | Returns 150 and rejects the claim that this proves autonomous idle sensing | Either condition differs | Tests represented elapsed time only |
| Revalidation | A stale cached state and one deterministic authoritative function | Calls the function, marks the cache revalidated and uses `SUCCEEDED` | Omits the call or fails either state check | Tests controlled tool use, not arbitrary web truth |
| State reconciliation | `PENDING` followed by a newer authoritative `APPROVED` event | Uses `APPROVED`, identifies `PENDING` as superseded and does not wait | Any of those three checks differs | Tests a controlled API task, not consumer state |
| Historical validity | `HEALTHY` on an earlier date and `DEGRADED` now | Preserves both states and says the earlier statement remains historically valid | Any of those three checks differs | Tests deterministic claim separation only |

PASS and FAIL apply to one probe, one exact returned model identifier, one methodology version, one date and the OpenAI API surface. They are never global model scores. They do not transfer to ChatGPT, Codex, Projects, a desktop app or another consumer surface.

`INCONCLUSIVE` is reserved for a completed experiment whose evidence cannot support either oracle. `OPERATIONAL_ERROR` means credentials, access, transport, provider response or parsing prevented a behavioral conclusion; it is explicitly not FAIL. Legacy `MATCH` and `MISMATCH` records remain readable but new V1 manual runs use PASS and FAIL.

## Human decision

The workflow computes the deterministic oracle and opens a normal pull request. Reviewers inspect the five results, exact/returned model IDs, machine signals, raw artifact link and stated limitations. Merge means “accept these scoped records into the public ledger.” Close means “do not publish these records.” Neither action changes observations for consumer products without a separate evidence-mapping review.

## Cost and credentials

The workflow makes one model-metadata request and up to eight inference requests. Its preflight estimate uses deliberately high token-price ceilings and refuses authorization above USD 0.50. This is not a provider-side hard spending cap. The `OPENAI_API_KEY` secret belongs in the protected `model-evaluation` GitHub environment, whose required reviewer should be the repository owner.
