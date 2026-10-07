# Private review desk

The review desk is a separate Cloudflare Worker with the Monitor's visual language. It is not part of the public static export. Nothing in this repository deploys it automatically. It stays inaccessible until Cloudflare Access and a repository-scoped GitHub App are configured.

## What it does

- Lists open automation proposals for model metadata, public evidence leads, and candidate decisions. The detail view shows changed files and newly appended lead/decision records.
- Offers an explicit **Validate proposal** action. This runs the read-only `Validate review proposal` workflow against the exact proposal commit and current `main` commit. The button to publish unlocks only after that run succeeds. This is necessary because pull requests opened by the repository's own Actions token do not reliably trigger normal pull-request checks.
- Allows the reviewer to merge a proposal only when its branch, labels, author, file allowlist, expected head SHA, current base SHA, mergeability, and explicit validation all match. Merging to `main` uses the existing production deployment workflows. The desk cannot merge code changes or arbitrary pull requests.
- Allows closing a proposal with a recorded reason.
- Shows incorporated evidence leads one by one. A decision with an evidence-based reason dispatches the existing `Review one evidence candidate` workflow, which opens a new append-only decision proposal. The reviewer then publishes that proposal from the same desk after validation. No candidate decision directly creates an observation, product/model association, PASS, or FAIL.

Proposal approval remains a batch operation because the current discovery workflows group a daily run in one pull request. The detail view makes the full batch visible. If finer model-by-model approval is needed, the discovery workflow must first stage separate proposals; the desk will not silently edit a generated batch.

## Security boundary

Cloudflare Access must protect **all traffic** to the review Worker. The Worker rejects requests without a Cloudflare-authenticated `ctx.access` identity, an exact audience match, and an email in its private `REVIEWER_EMAILS` secret. Mutations additionally require same-origin requests and `REVIEW_WRITE_ENABLED=true`. GitHub credentials remain Worker secrets; none are sent to the browser. The page uses a restrictive content security policy and renders untrusted GitHub content as text.

The GitHub App must be installed on `diegolinan/eternal-tuesday-monitor` only. Give it repository permissions: Actions **write**, Pull requests **write**, Issues **write**, Contents **read**. It needs no administration, secrets, workflows, or code-write permission. Store these values as Worker secrets, never in Git, browser storage, chat, or build output:

- `GITHUB_APP_ID`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_APP_PRIVATE_KEY_PKCS8` (base64-encoded PKCS#8 DER private key)
- `REVIEWER_EMAILS` (comma-separated exact email allowlist)

Set `REVIEW_ACCESS_AUD` to the Access application's audience tag. Keep `REVIEW_WRITE_ENABLED=false` until the Worker is protected by Access, the secret values are installed, and an unauthorized request has been confirmed to return 403. Then explicitly enable writes and redeploy the Worker once. This is initial activation only; individual future decisions do not require manual deployment.

Do not deploy this Worker first and add Access later. When configuring a new private key or reviewer email, confirm the exact Cloudflare Worker secret destination before writing it.

## Local checks

`node --test tests/private-review-desk.test.mjs` runs without credentials. `npm test`, `npm run lint`, and the regular build remain the broader repository checks. The private Worker is intentionally separate from the public Vercel/Pages build.
