import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('secondary-page improvements preserve independent signals and early availability', async () => {
  const [form, changes, responsibility, models, css] = await Promise.all([
    read('app/contribute/page.tsx'),
    read('app/changelog/page.tsx'),
    read('components/responsibility-map.tsx'),
    read('components/model-signal-key.tsx'),
    read('app/typesafe-reference.css'),
  ]);
  assert.equal((form.match(/className="form-unavailable"/g) ?? []).length, 1);
  assert.ok(
    form.indexOf('className="form-unavailable"') <
      form.indexOf('className="form-fields"'),
  );
  assert.match(changes, /groupChanges\(events, type\)/);
  assert.match(changes, /aria-controls="change-register"/);
  assert.match(responsibility, /not accepted evidence/);
  assert.match(responsibility, /not an\s+accepted verdict/);
  assert.match(models, /Independent questions\. Not a progress bar\./);
  assert.match(
    css,
    /\.surface-vendor\[open\] > summary:focus-visible\s*\{[^}]*background: var\(--ink\);[^}]*color: var\(--paper\)/,
  );
  assert.match(css, /\.surface-products h3\s*\{[^}]*background: var\(--pink\)/);
  assert.match(css, /prefers-reduced-motion: no-preference/);
});

test('secondary pages use one colophon, aligned card rows, and a solid notice', async () => {
  for (const path of [
    'app/page.tsx',
    'app/contributors/page.tsx',
    'app/contribute/page.tsx',
    'app/changelog/page.tsx',
    'app/models/page.tsx',
  ]) {
    assert.doesNotMatch(await read(path), /<footer/);
  }
  const css = await read('app/typesafe-reference.css');
  assert.match(
    css,
    /\.clockkeeper-grid \.clockkeeper-card\s*\{[^}]*grid-template-rows: subgrid/,
  );
  assert.match(
    css,
    /\.contribution-form \.form-unavailable\s*\{[^}]*border: 0;[^}]*background: #c51c58;[^}]*color: #fff/,
  );
  assert.match(css, /\.clockkeeper-card h3,[\s\S]*?text-transform: capitalize/);
  assert.match(
    css,
    /\.changelog-list article h2,[\s\S]*?text-transform: capitalize/,
  );
});

test('visual corrections keep gutters purposeful and footer colors consistent', async () => {
  const [css, page] = await Promise.all([
    read('app/typesafe-reference.css'),
    read('app/page.tsx'),
  ]);
  assert.match(css, /\.hero h1\.hero-masthead\s*\{[^}]*text-align: left/);
  const hero = page.slice(
    page.indexOf('<section className="hero"'),
    page.indexOf('</section>', page.indexOf('<section className="hero"')),
  );
  assert.doesNotMatch(hero, /SignalEphemera/);
  assert.equal((page.match(/<SignalEphemera variant="rail"/g) || []).length, 2);
  assert.match(css, /scrollbar-gutter: auto/);
  assert.match(css, /\.model-provenance p,[\s\S]*?line-height: 1\.5/);
  assert.match(
    css,
    /\.probe-card--revalidation-v2 \.probe-illustration figcaption\s*\{[^}]*background: transparent/,
  );
  assert.match(
    css,
    /main > footer,\s*\.author-footer\s*\{\s*background: var\(--ink\);\s*color: var\(--paper\)/,
  );
  assert.match(
    css,
    /\.author-footer a:focus-visible\s*\{[^}]*color: var\(--pink\)/,
  );
});

test('dossiers scroll, consent stays unboxed, and status text stays dark', async () => {
  const css = await read('app/typesafe-reference.css');
  assert.match(
    css,
    /\.record-dialog\[data-slot='dialog-content'\][\s\S]*?overflow-y: auto/,
  );
  assert.match(css, /label\.attribution-consent\s*\{\s*border: 0/);
  assert.match(
    css,
    /\.evidence-watch-state > strong\s*\{\s*color: var\(--ink\)/,
  );
  assert.match(css, /\.continuity-broadcast\s*\{\s*background: var\(--cyan\)/);
});

test('decorative signals are non-semantic and author links use the supplied destinations', async () => {
  const [ephemera, layout, css] = await Promise.all([
    read('components/signal-ephemera.tsx'),
    read('app/layout.tsx'),
    read('app/typesafe-reference.css'),
  ]);
  assert.match(ephemera, /aria-hidden="true"/);
  assert.doesNotMatch(ephemera, /Math\.random|fetch\(|setInterval/);
  assert.match(ephemera, /crypto.getRandomValues/);
  assert.doesNotMatch(ephemera, /<img|<svg/);
  assert.match(css, /animation: context-drift 4\.8s ease-in-out 1 both/);
  assert.match(css, /\.temporal-now\.is-running,[\s\S]*?animation: none/);
  assert.match(layout, /https:\/\/www\.linkedin\.com\/in\/diegolinan/);
  assert.match(
    layout,
    /your-ai-lives-eternal-tuesday-diego-li%C3%B1an-av2xf\//,
  );
});

test('the closing colophon is singular and the interlude is bounded and illustrative', async () => {
  const [page, layout, interlude, css] = await Promise.all([
    read('app/page.tsx'),
    read('app/layout.tsx'),
    read('components/temporal-interlude.tsx'),
    read('app/typesafe-reference.css'),
  ]);
  assert.doesNotMatch(page, /<footer/);
  assert.equal((layout.match(/<footer/g) || []).length, 1);
  assert.equal((page.match(/<TemporalInterlude/g) || []).length, 1);
  assert.match(interlude, /Not live telemetry/);
  assert.match(interlude, /observer.disconnect/);
  assert.match(interlude, /prefers-reduced-motion/);
  assert.doesNotMatch(interlude, /fetch\(|setInterval/);
  assert.match(
    css,
    /\.author-footer\.site-colophon\s*\{[^}]*border-left: 6px solid var\(--pink\)/,
  );
  assert.match(css, /\.signal-margin > \.signal-rail\s*\{[^}]*right: 8px/);
  assert.match(
    css,
    /\.signal-margin > \.signal-rail\s*\{[^}]*width: 12px;\s*white-space: nowrap/,
  );
});

test('the active reference layer keeps the supplied TypeSafe typography metrics', async () => {
  const [layout, css] = await Promise.all([
    read('app/layout.tsx'),
    read('app/typesafe-reference.css'),
  ]);
  assert.match(layout, /import '\.\/typesafe-reference\.css'/);
  assert.doesNotMatch(layout, /import '\.\/ephemera-final\.css'/);
  for (const size of [150, 140, 94, 54])
    assert.ok(css.includes(`--ts-h1-size: ${size}px`));
  assert.match(css, /line-height: 80%/);
  assert.match(css, /letter-spacing: 0em/);
  assert.match(css, /-webkit-text-stroke: 1\.2px #1e1e1edb/);
  assert.match(css, /--yellow: #fee857/);
  assert.match(css, /--acid: var\(--yellow\)/);
  assert.match(css, /--cyan: #00c8d0/);
});

test('five conceptual probe plates are added without replacing the two retained collages', async () => {
  const [page, manifestText] = await Promise.all([
    read('app/page.tsx'),
    read('content/manifest.json'),
  ]);
  const manifest = JSON.parse(manifestText);
  for (const key of [
    'temporal-anchor-v2',
    'elapsed-time-v2',
    'revalidation-v2',
    'state-reconciliation-v2',
    'historical-validity-v2',
  ]) {
    assert.ok(page.includes(`artwork: '${key}'`));
    assert.ok(
      manifest.assets.some((asset) => asset.path.endsWith(`/jev/${key}.webp`)),
    );
  }
  assert.match(page, /Not model transcripts or test results/);
  assert.equal((page.match(/alt=\{item.artAlt\}/g) || []).length, 2);
  assert.equal(
    manifest.assets.find((asset) => asset.path.endsWith('sequence-collage.png'))
      .sha256,
    '7275b590cb689a672941c510462ef12cd6cdc694d9fa19da11c247d538cf8e55',
  );
  assert.equal(
    manifest.assets.find((asset) => asset.path.endsWith('state-overlay.png'))
      .sha256,
    'da9f8f4844b9e645b3e0910f4cca7ee25bc1320df9f1168441dcb66e3e4dba6d',
  );
});

test('history stays open and type changes by role, not alternating headlines', async () => {
  const css = await read('app/typesafe-reference.css');
  assert.match(
    css,
    /\.timeline-track::before\s*\{\s*content: none;\s*display: none;/,
  );
  assert.match(
    css,
    /\.console-rule,[\s\S]*?\.separation-note,[\s\S]*?border-radius: 0;/,
  );
  assert.doesNotMatch(
    css,
    /\.broadcast-copy h2 em\s*\{\s*font-family: var\(--font-terminal\)/,
  );
  assert.doesNotMatch(css, /\.probe-card:nth-child\(3\) \.probe-copy h3/);
  assert.match(
    css,
    /\.latest-movements h2,[\s\S]*?font-family: var\(--font-display\)/,
  );
  assert.match(
    css,
    /\.instrument-title,[\s\S]*?font-family: var\(--font-terminal\)/,
  );
  const page = await read('app/page.tsx');
  assert.match(page, /Same conversation\. A different now\./);
  assert.match(page, /The next message is not the next moment\./);
});

test('the changelog preserves its mixed-case display title in export checks', async () => {
  const [page, validator] = await Promise.all([
    read('app/changelog/page.tsx'),
    read('scripts/validate-static-export.mjs'),
  ]);
  assert.match(page, /<h1>Monitor Changelog<\/h1>/);
  assert.match(validator, /includes\('Monitor Changelog'\)/);
});

test('abstract editorial visuals replace image-based state labels', async () => {
  const [page, hero, status, automation, layout, css] = await Promise.all([
    read('app/page.tsx'),
    read('components/chronoscope.tsx'),
    read('components/status-emblem.tsx'),
    read('components/automation-status.tsx'),
    read('app/layout.tsx'),
    read('app/jev-system.css'),
  ]);
  assert.match(hero, /Elapsed time in the illustration/);
  assert.match(hero, /Not a model test/);
  assert.match(hero, /prefers-reduced-motion: reduce/);
  assert.match(hero, /IntersectionObserver/);
  assert.match(hero, /clearInterval/);
  assert.doesNotMatch(hero, /fetch\(|XMLHttpRequest/);
  assert.match(page, /assets\/jev\/sequence-collage\.webp/);
  assert.match(page, /assets\/jev\/state-overlay\.webp/);
  for (const source of [page, hero, status, automation, layout]) {
    assert.doesNotMatch(source, /assets\/ephemera\//);
  }
  assert.doesNotMatch(status, /<img/);
  assert.match(layout, /jev-system\.css/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /@media[^{]*620px/);
});

test('the 3D title object does not replace the interactive state-drift illustration', async () => {
  const [page, css] = await Promise.all([
    read('app/page.tsx'),
    read('app/temporal-clock-hero.css'),
  ]);
  assert.match(page, /<div className="hero-first-plane">[\s\S]*?<TemporalClockHero \/>/);
  assert.match(page, /<div className="hero-second-plane">[\s\S]*?<div className="hero-copy">[\s\S]*?<Chronoscope \/>/);
  assert.match(css, /\.hero-second-plane\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
});
