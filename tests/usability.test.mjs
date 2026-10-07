import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { readModelView } from '../lib/view-links.mjs';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('missing model links are explicit rather than silently selecting another record', () => {
  const models = [{ id: 'known-model' }];
  for (const id of [
    'missing-model',
    'long-id-'.repeat(100),
    '<script>alert(1)</script>',
  ]) {
    const state = readModelView(`?model=${encodeURIComponent(id)}`, models);
    assert.equal(state.modelId, null);
    assert.equal(state.missingModel, id);
  }
  assert.equal(readModelView('?model=known-model', models).missingModel, null);
  assert.equal(readModelView('?model=', models).missingModel, null);
});

test('every public main is a reliable keyboard skip target without an extra Tab stop', async () => {
  for (const page of [
    'app/page.tsx',
    'app/models/page.tsx',
    'app/changelog/page.tsx',
    'app/contributors/page.tsx',
    'app/contribute/page.tsx',
  ]) {
    assert.match(
      await read(page),
      /<main[^>]*id="main-content"[^>]*tabIndex=\{-1\}/,
    );
  }
  assert.match(
    await read('app/layout.tsx'),
    /className="skip-link" href="#main-content"/,
  );
});

test('search feedback, recovery, and missing-link notices remain accessible', async () => {
  const inventory = await read('components/model-inventory.tsx');
  assert.match(inventory, /htmlFor="model-search"/);
  assert.match(inventory, /id="model-search"/);
  assert.match(inventory, /type="search"/);
  assert.match(
    inventory,
    /<output\s+className="coverage-result-count"\s+aria-live="polite"\s+aria-atomic="true"/,
  );
  assert.match(inventory, /Clear search/);
  assert.match(inventory, /This search already includes the complete catalog/);
  assert.match(inventory, /<code>\{missingModel\}<\/code>/);
  const home = await read('app/page.tsx');
  assert.match(home, /<code>\{missingObservation\}<\/code>/);
  assert.match(home, /Optional visit comparison must never block/);
  assert.match(home, /Array.isArray\(prior.fingerprints\)/);
});

test('lossless delivery copies are smaller and retain reserved image geometry', async () => {
  for (const name of ['state-overlay', 'sequence-collage']) {
    const base = new URL(`../public/assets/jev/${name}`, import.meta.url);
    const [original, optimized, bytes] = await Promise.all([
      stat(new URL(`${base.href}.png`)),
      stat(new URL(`${base.href}.webp`)),
      readFile(new URL(`${base.href}.webp`)),
    ]);
    assert.ok(optimized.size < original.size * 0.8);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.equal(bytes.toString('ascii', 12, 16), 'VP8L');
  }
  const reveal = await read('components/scroll-reveal-image.tsx');
  assert.equal((reveal.match(/width=\{width\}/g) ?? []).length, 2);
  assert.equal((reveal.match(/height=\{height\}/g) ?? []).length, 2);
  assert.equal((reveal.match(/loading="lazy"/g) ?? []).length, 2);
});

test('motion preference and high-contrast focus are retained', async () => {
  const css = await read('app/typesafe-reference.css');
  assert.match(css, /Two-tone focus/);
  assert.match(css, /outline: 2px solid #1e1e1e !important/);
  assert.match(css, /box-shadow: 0 0 0 4px #fefefe !important/);
  assert.match(
    await read('app/editorial.css'),
    /prefers-reduced-motion: reduce[\s\S]*?animation-iteration-count: 1 !important/,
  );
  assert.match(
    await read('components/chronoscope.tsx'),
    /setPlaying\(!reduce\)/,
  );
  assert.match(
    await read('components/scroll-reveal-image.tsx'),
    /reducedMotion.removeEventListener/,
  );
});
