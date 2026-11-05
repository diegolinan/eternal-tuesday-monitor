# Dependency security maintenance

Keep the Vite, Vinext, React, React DOM, React Server DOM and RSC plugin versions
compatible. Vinext 1.4.3 requires the React 19.3.1 family and RSC plugin 0.5.37
or newer; do not update one of these in isolation.

## Retained overrides

- `sharp` 0.35.5 retains the existing patched image dependency.
- `undici` 7.30.2 replaces vulnerable 7.x copies without moving to a new major.
- `satori` overrides its nested `fflate` copies to 0.7.5. Satori 0.33.5 pins 0.7.3, affected by
  [GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98).
  This override leaves the separate 0.8.3 copy intact. Remove it when the upstream
  dependency no longer pins an affected version, then rerun audit and builds.

## UI styles

The site imported only `shadcn/tailwind.css` from the shadcn CLI package.
`app/vendor/shadcn-tailwind.css` preserves that file from shadcn 4.18.0 unchanged,
with its MIT license. This avoids installing the CLI's unused code-generation and
server dependencies on every build. `@shadcn/react` remains installed because
existing UI components import it.

For a future style update, compare the upstream CSS with this vendored file and
retain its license. The component generator can be invoked explicitly when
needed; it is not required to build the published site.

## Verification

GitHub Actions uses Node 22 and npm 10. When updating the lockfile from a machine with npm 11, verify it with `npx --yes npm@10.9.9 ci` before publishing.

Use `npm ci`, `npm audit`, `npm test`, `npm run lint`, `npm run intake:types`,
and `npx tsc --noEmit`. Build and validate both public targets using
`build:pages` / `static:validate` and `build:vercel` / `static:validate:vercel`.

On 2026-11-05, npm audit reported zero known vulnerabilities after this update.
This is a dated dependency audit result, not a guarantee about all application
security. The initial lockfile reported 20 affected packages; GitHub alert counts
use a different unit and may take time to refresh after a merge.
