# Vercel candidate deployment

Vercel is a parallel hosting candidate. GitHub Pages remains the canonical
public production site until a separate, explicit migration decision is made.
The OpenAI-hosted prototype and the Cloudflare contribution intake are not
modified by this candidate.

The candidate uses a static export at the domain root. GitHub Pages continues
to use `/eternal-tuesday-monitor/`. Both artifacts are built from the same
components and versioned data; there is no second site implementation.

## One-time setup

1. Create a Vercel Hobby project named `eternal-tuesday-monitor` for this
   repository. Do not enable a paid plan or trial.
2. Automatic Git deployments are disabled by `vercel.json`. The manual
   workflow compiles the same live public operational snapshot used by
   production before it deploys the candidate.
3. Create a narrowly scoped Vercel access token. Never put its value in source,
   a pull request, chat, workflow output, or documentation.
4. Add these repository Actions secrets:
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
5. Retain the existing repository variables
   `NEXT_PUBLIC_CONTRIBUTION_ENDPOINT` and
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. The contribution Worker remains the form
   backend. Its Turnstile hostname policy must separately allow the candidate
   hostname before submissions from the candidate can succeed.
6. Run **Deploy Vercel candidate** manually. It validates canonical data,
   reconstructs the latest public operational projection, builds a root-hosted
   static export, validates its paths, and deploys it with the pinned Vercel
   CLI.

The workflow is deliberately `workflow_dispatch` only. It performs no catalog
or evidence mutation, opens no issue, and makes no change to GitHub Pages. If
the candidate is rejected, revoke its token and remove the Vercel project;
production continues unchanged.

The expected free candidate URL is
`https://eternal-tuesday-monitor.vercel.app/`, subject to project-name
availability. Vercel may assign a different project slug.
