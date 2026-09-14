# Vercel production deployment

Vercel is the canonical public production host for the Monitor:

`https://eternal-tuesday-monitor.vercel.app/`

The filename is retained as a historical trace of the candidate stage. The
candidate was explicitly approved and promoted without creating a second site
implementation. GitHub Pages remains a parallel static fallback under its
repository base path, and the OpenAI-hosted prototype remains unchanged.

## Deployment path

The production workflow runs on every push to `main` and can also be started
manually with `workflow_dispatch`. It validates canonical data, reconstructs
the current public operational projections, builds a root-hosted static export,
checks its routes and assets, and deploys the prebuilt artifact with the pinned
Vercel CLI.

Automatic Git deployments remain disabled in `vercel.json`; the validated
workflow is the only Vercel deployment path. Required repository secrets are
`VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`. The public intake also
requires the existing `NEXT_PUBLIC_CONTRIBUTION_ENDPOINT` and
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` variables.

The workflow performs no catalog or evidence mutation and opens no issue. The
contribution Worker remains a separate bounded backend and accepts both the
canonical Vercel origin and the GitHub Pages fallback origin.

Anonymous aggregate Web Analytics is included only in the Vercel production
build. It is not added to either fallback build and does not receive form field
contents.
