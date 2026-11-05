# Vercel production deployment

Vercel is the canonical public production host for the Monitor:

`https://eternal.diegolinan.me/`

The filename is retained as a historical trace of the candidate stage. The
candidate was explicitly approved and promoted without creating a second site
implementation. GitHub Pages remains a parallel static fallback under its
repository base path, and the OpenAI-hosted prototype remains unchanged.

## Deployment path

The production workflow runs on every push to `main`, after every completed
official-model discovery run, and can also be started manually with
`workflow_dispatch`. The explicit discovery completion trigger is required
because commits made with the workflow's own GitHub token do not emit another
`push` workflow event. It validates canonical data, reconstructs the current
public operational projections, builds a root-hosted static export, checks its
routes and assets, and deploys the prebuilt artifact with the pinned Vercel CLI.

Automatic Git deployments remain disabled in `vercel.json`; the validated
workflow is the only Vercel deployment path. Required repository secrets are
`VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`. The public intake also
requires the existing `NEXT_PUBLIC_CONTRIBUTION_ENDPOINT` and
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` variables.

The workflow performs no catalog or evidence mutation and opens no issue. The
contribution Worker remains a separate bounded backend and accepts both the
custom production origin, the previous Vercel origin, and the GitHub Pages fallback origin.

Anonymous aggregate Web Analytics is included only in the Vercel production
build. It is not added to either fallback build and does not receive form field
contents.

## Custom-domain migration

Production uses `https://eternal.diegolinan.me/`. Both previous Vercel aliases
redirect permanently (308) to this origin. Pages remains a separate fallback.

Before verifying a public submission, add `eternal.diegolinan.me` to the existing
Cloudflare Turnstile widget hostname list. The intake Worker checks both the
exact request origin and the hostname returned by Turnstile; adding a DNS alias
alone cannot authorize submissions. Deploy the updated intake Worker as well as
the static site. Keep the private review Worker's existing Access policy.

After publication, verify canonical metadata, nested routes, asset loading,
intake status CORS, and a Turnstile challenge on the new hostname. Do not submit
a fabricated evidence lead to test the migration.