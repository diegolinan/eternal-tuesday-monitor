import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readChangeType, readModelView, viewHref } from '../lib/view-links.mjs';

test('change filter restores known types and falls back safely', () => {
  const types = ['OBSERVATION_ADDED', 'MODEL_DISCOVERED'];
  assert.equal(
    readChangeType('?type=OBSERVATION_ADDED', types),
    'OBSERVATION_ADDED',
  );
  assert.equal(readChangeType('?type=UNKNOWN', types), 'ALL');
  assert.equal(readChangeType('', types), 'ALL');
});
test('model links preserve searches, scope, and exact identities independently', () => {
  const models = [{ id: 'model-a' }];
  assert.deepEqual(
    readModelView('?scope=all&q=GPT%2Btest&model=model-a', models),
    { scope: 'all', query: 'GPT+test', modelId: 'model-a', missingModel: null },
  );
  assert.deepEqual(readModelView('?scope=invalid&model=missing', models), {
    scope: 'focus',
    query: '',
    modelId: null,
    missingModel: 'missing',
  });
  assert.deepEqual(readModelView('', models), {
    scope: 'focus',
    query: '',
    modelId: null,
    missingModel: null,
  });
});
test('links round-trip punctuation and deployment base paths', () => {
  const query = 'Claude / GPT + café & "trial"';
  const href = viewHref(
    '/eternal-tuesday-monitor/models/',
    { q: query, scope: 'all', unused: null },
    'model:a',
  );
  const url = new URL(href, 'https://example.com');
  assert.equal(url.pathname, '/eternal-tuesday-monitor/models/');
  assert.equal(url.searchParams.get('q'), query);
  assert.equal(decodeURIComponent(url.hash.slice(1)), 'model:a');
  assert.equal(viewHref('/changelog/', { type: null }), '/changelog/');
});
test('URL subscription supports navigation and cleans listeners; glossary stays available', async () => {
  const read = (path) =>
    readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const hook = await read('components/use-view-url.ts');
  assert.match(hook, /addEventListener\('popstate'/);
  assert.match(hook, /removeEventListener\('popstate'/);
  assert.match(hook, /window.history.state/);
  assert.match(hook, /cancelAnimationFrame/);
  const inventory = await read('components/model-inventory.tsx');
  assert.match(inventory, /<details className="coverage-key">/);
  assert.match(inventory, /id=\{model.id\}/);
  assert.match(inventory, /linked=\{model.id === modelId\}/);
  assert.match(await read('app/changelog/page.tsx'), /id=\{event.id\}/);
});
