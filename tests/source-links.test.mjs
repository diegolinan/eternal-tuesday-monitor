import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLinks } from '../lib/source-links.mjs';

test('catalog and exact model links have distinct visible labels', () => {
  const urls = [
    'https://docs.x.ai/developers/models',
    'https://docs.x.ai/developers/models/grok-imagine-image-2.0',
  ];
  assert.deepEqual(sourceLinks(urls), [
    { url: urls[0], label: 'Model Catalog' },
    { url: urls[1], label: 'Model Details' },
  ]);
  assert.equal(
    sourceLinks(['https://developers.openai.com/api/docs/models/all'])[0].label,
    'Model Catalog',
  );
  assert.equal(
    sourceLinks(['https://ai.google.dev/gemini-api/docs/models?hl=en'])[0]
      .label,
    'Model Catalog',
  );
});
test('duplicate destinations are removed, distinct documents stay distinguishable', () => {
  const urls = [
    'https://example.com/models/a',
    'https://example.com/models/b',
    'https://example.com/models/a',
  ];
  const links = sourceLinks(urls);
  assert.equal(links.length, 2);
  assert.equal(new Set(links.map((link) => link.label)).size, 2);
  assert.deepEqual(
    links.map((link) => link.url),
    urls.slice(0, 2),
  );
});
test('other official documents retain meaningful destination labels', () => {
  assert.equal(
    sourceLinks(['https://code.claude.com/docs/en/model-config'])[0].label,
    'Model Configuration',
  );
  assert.equal(
    sourceLinks(['https://example.com/research/paper'])[0].label,
    'example.com/research/paper',
  );
});
