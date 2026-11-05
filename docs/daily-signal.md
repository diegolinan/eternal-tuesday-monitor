# Daily quote fingerprint

The homepage's closing `[ seq / Δ ]` widget displays the complete SHA-256 of
one daily quote. It is an editorial artifact, unrelated to evidence or system
status. Vertical decorative rails retain their existing behavior.

Source: [Quotable's official collection](https://github.com/quotable-io/data),
pinned to commit `20037e8161167d25e971d2dcfe1ee0398eb8eb89`. The hosted
`api.quotable.io` endpoint failed HTTPS certificate validation when tested on
2026-11-05; this integration uses the project's collection on GitHub instead.
No API key, runtime request, new dependency, or hosted service is required.

`node scripts/update-daily-signal.mjs` selects an entry using the first eight
hexadecimal digits of SHA-256(UTC date), modulo the collection length. This
gives a reproducible daily selection, not a promise of no repeated quotes.
The displayed hash covers the quote's exact UTF-8 text, including punctuation
and whitespace, without the author or date. Quotable supplies the attribution;
we do not independently verify it.

`public/data/daily-signal.json` preserves the quote, attribution, source, edition
date, and digest so anyone can reproduce it. The browser uses the built
snapshot; all visitors and reloads see the same edition.

Clicking the widget (or pressing Enter/Space when focused) scrambles its
characters and progressively reveals the saved quote, followed by its author.
The visible label stays `[ seq / Δ ]` and the cursor stays at its default arrow.
The reveal runs once per page load; further clicks or key presses do nothing.
The animation stops on completion, unmount, or tab hiding. Reduced-motion
preferences reveal the quote immediately; screen readers receive the final
phrase rather than the changing random characters. This reveals the stored
text, rather than reversing SHA-256.

The existing daily discovery workflow updates this file before validation and
includes it in its automatic commit. Successful scheduled runs publish the new
edition through the existing deployment workflows. GitHub's schedule runs at
12:43 UTC (09:43 Buenos Aires), subject to Actions delays; the quote does not
change at midnight in the browser. Other deployments keep the saved edition.

If retrieval or validation fails, the last valid file remains byte-for-byte
unchanged, with its original date. A workflow warning records the failure. A
first run without a valid snapshot fails rather than manufacturing a quote.
The static export validator checks the digest and its presence in the homepage
for both Vercel and GitHub Pages.
