import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as openai from '../scripts/discovery/adapters/openai.mjs';
import { fact } from '../scripts/discovery/adapters/common.mjs';
import {
  classifyDiscoveryEvent,
  evaluateRelevance,
} from '../scripts/discovery/decision.mjs';
import {
  normalizeDiscoveries,
  proposeEvents,
} from '../scripts/discovery/lifecycle.mjs';
import { projectModels } from '../scripts/discovery/project.mjs';
import { readOfficial } from '../scripts/discovery/fetch.mjs';

const config = JSON.parse(
  await readFile(new URL('../config/model-discovery.json', import.meta.url)),
);
const relevancePolicy = JSON.parse(
  await readFile(
    new URL('../config/model-relevance-policy.json', import.meta.url),
  ),
);
const official = config.sources.find(
  (source) => source.id === 'discovery-openai-docs',
);
const provenance = (id, hash = 'a') => [
  {
    source_id: official.id,
    url: `https://developers.openai.com/api/docs/models/${id}`,
    checked_on: '2026-09-05',
    sha256: hash.repeat(64),
    parser_version: official.parser_version,
  },
];
const modelFact = (id) =>
  fact(official, {
    display_name: id.replaceAll('-', ' ').toUpperCase(),
    api_model_id: id,
    provenance: provenance(id),
  });

test('production discovery registry contains public sources only and covers model, product, Cursor, and research changes', () => {
  assert.ok(
    config.sources.every((source) => source.url.startsWith('https://')),
  );
  assert.ok(
    config.sources.every((source) =>
      Object.keys(source).every(
        (key) => key !== ['credential', 'env'].join('_'),
      ),
    ),
  );
  assert.ok(
    config.sources.every(
      (source) =>
        new URL(source.url).hostname !== ['api', 'openai', 'com'].join('.'),
    ),
  );
  assert.ok(
    config.sources.some((source) => source.type === 'official-model-index'),
  );
  assert.ok(
    config.sources.some(
      (source) => source.type === 'official-product-changelog',
    ),
  );
  assert.ok(
    config.sources.some((source) => source.vendor_id === 'vendor-cursor'),
  );
  assert.ok(config.sources.some((source) => source.type === 'research-feed'));
});

test('future MODEL_C is discovered as data without an allowlist or source-code change', () => {
  const beforeUrls = openai.index(
    '<main><a href="/api/docs/models/gpt-7-model-a">A</a><a href="/api/docs/models/gpt-7-model-b">B</a></main>',
    official,
  );
  const afterUrls = openai.index(
    '<main><a href="/api/docs/models/gpt-7-model-a">A</a><a href="/api/docs/models/gpt-7-model-b">B</a><a href="/api/docs/models/gpt-7-model-c">C</a></main>',
    official,
  );
  assert.deepEqual(
    afterUrls.filter((url) => !beforeUrls.includes(url)),
    ['https://developers.openai.com/api/docs/models/gpt-7-model-c'],
  );
  const [candidate] = normalizeDiscoveries(
    [modelFact('gpt-7-model-c')],
    [],
    [],
    '2026-09-05',
  );
  const [event] = proposeEvents([candidate], [], '2026-09-05');
  assert.equal(event.model.api_model_id, 'gpt-7-model-c');
  assert.equal(
    classifyDiscoveryEvent(event, [], config.sources, relevancePolicy).decision,
    'AUTO_ACCEPT',
  );
});

test('unchanged model input is idempotent and produces no duplicate semantic event', () => {
  const first = normalizeDiscoveries(
    [modelFact('gpt-model-c')],
    [],
    [],
    '2026-09-05',
  );
  const second = normalizeDiscoveries(
    [modelFact('gpt-model-c')],
    first,
    [],
    '2026-09-05',
  );
  assert.equal(proposeEvents(first, [], '2026-09-05').length, 1);
  assert.equal(proposeEvents(second, first, '2026-09-05').length, 0);
});

test('failed source input preserves the accepted catalog and creates no model event', () => {
  const accepted = normalizeDiscoveries(
    [modelFact('gpt-model-a')],
    [],
    [],
    '2026-09-05',
  );
  const before = structuredClone(accepted);
  assert.deepEqual(
    proposeEvents(
      normalizeDiscoveries([], accepted, [], '2026-09-06'),
      accepted,
      '2026-09-06',
    ),
    [],
  );
  assert.deepEqual(accepted, before);
});

test('public-source refresh removes stale account telemetry from current model state', () => {
  const stale = normalizeDiscoveries(
    [modelFact('gpt-model-a')],
    [],
    [],
    '2026-09-05',
  )[0];
  stale.account_access = 'ACCESS_CONFIRMED';
  stale.account_checked_on = '2026-09-05';
  stale.provenance.push({
    ...provenance('gpt-model-a')[0],
    source_id: 'retired-account-source',
    url: 'https://provider.invalid/models',
  });
  const [current] = normalizeDiscoveries(
    [modelFact('gpt-model-a')],
    [stale],
    [],
    '2026-09-06',
  );
  assert.equal(current.account_access, 'UNKNOWN');
  assert.equal(current.account_checked_on, null);
  assert.ok(current.provenance.every((item) => item.source_id === official.id));
});

test('Astra canonical discovery is sourced from official public OpenAI documentation without special-case parser code', async () => {
  const events = (
    await readFile(
      new URL('../data/model-discovery/events.jsonl', import.meta.url),
      'utf8',
    )
  )
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  const astra = events.find(
    (event) => event.model.api_model_id === 'gpt-6-astra',
  );
  assert.ok(astra);
  assert.ok(
    astra.model.provenance.some(
      (item) =>
        item.source_id === official.id &&
        item.url.startsWith('https://developers.openai.com/api/docs/models/'),
    ),
  );
  assert.equal(
    evaluateRelevance(astra.model, relevancePolicy).state,
    'DISCOVERED_RELEVANT',
  );
  const parser = await readFile(
    new URL('../scripts/discovery/adapters/openai.mjs', import.meta.url),
    'utf8',
  );
  assert.equal(parser.toLowerCase().includes('astra'), false);
});

test('public retrieval is GET-only and sends no authorization header', async () => {
  const result = await readOfficial(
    official.url,
    official,
    { timeout_ms: 1000, max_response_bytes: 1000 },
    async (_url, options) => {
      assert.equal(options.method, 'GET');
      assert.equal('Authorization' in options.headers, false);
      return new Response('<main>ok</main>', { status: 200 });
    },
  );
  assert.equal(result.http_status, 200);
});

test('publicly discovered model is visible without manufacturing an observation or consumer surface', () => {
  const [model] = normalizeDiscoveries(
    [modelFact('gpt-7-model-c')],
    [],
    [],
    '2026-09-05',
  );
  const [event] = proposeEvents([model], [], '2026-09-05');
  const view = projectModels(
    [event],
    [],
    { providers: ['vendor-openai'], denied_api_ids: [], methodologies: [] },
    new Map([['vendor-openai', { name: 'OpenAI' }]]),
    '2026-09-05',
    {
      catalog: [
        {
          id: model.id,
          identity_status: 'named',
          relevance_state: 'DISCOVERED_RELEVANT',
        },
      ],
      probes: [1, 2, 3, 4, 5].map((number) => ({
        id: `p${number}`,
        name: `Probe ${number}`,
      })),
    },
  );
  assert.equal(view.length, 1);
  assert.equal(view[0].lifecycleState, 'DISCOVERED');
  assert.ok(
    view[0].probeCoverage.every((probe) => probe.state === 'NOT_TESTED'),
  );
  assert.deepEqual(view[0].surfaces, []);
});

test('old operational API errors have no public empirical result or surface', () => {
  const [model] = normalizeDiscoveries(
    [modelFact('gpt-7-model-c')],
    [],
    [],
    '2026-09-05',
  );
  const [event] = proposeEvents([model], [], '2026-09-05');
  const view = projectModels(
    [event],
    [],
    { providers: ['vendor-openai'], denied_api_ids: [], methodologies: [] },
    new Map([['vendor-openai', { name: 'OpenAI' }]]),
    '2026-09-05',
    {
      catalog: [
        {
          id: model.id,
          identity_status: 'named',
          relevance_state: 'DISCOVERED_RELEVANT',
        },
      ],
      probes: [1, 2, 3, 4, 5].map((number) => ({
        id: `p${number}`,
        name: `Probe ${number}`,
      })),
      evaluationResults: [
        {
          model_id: model.id,
          probe_id: 'p1',
          status: 'OPERATIONAL_ERROR',
          evidence_class_id: 'evidence-controlled-experiment',
          verified_on: '2026-09-05',
          limitations: ['No behavioral conclusion.'],
          request_count: 0,
        },
      ],
    },
  );
  assert.equal(view[0].probeCoverage[0].empiricalResult, null);
  assert.deepEqual(view[0].surfaces, []);
  assert.equal(view[0].executionState, 'NOT_RUN');
});

test('production workflows are GitHub-only and contain no provider inference, targets, or provider secret', async () => {
  const discovery = await readFile(
    new URL('../.github/workflows/discover-models.yml', import.meta.url),
    'utf8',
  );
  const pages = await readFile(
    new URL('../.github/workflows/pages.yml', import.meta.url),
    'utf8',
  );
  const runner = await readFile(
    new URL('../scripts/discovery/run.mjs', import.meta.url),
    'utf8',
  );
  const workflows = `${discovery}\n${pages}`;
  const providerSecret = ['OPENAI', 'API', 'KEY'].join('_');
  assert.match(discovery, /schedule:/);
  assert.match(discovery, /workflow_dispatch:/);
  assert.doesNotMatch(discovery, /actions\/deploy-pages/);
  assert.match(pages, /workflow_run:/);
  assert.match(pages, /types: \[in_progress, completed\]/);
  assert.match(pages, /npm run status:compile/);
  assert.match(pages, /actions\/deploy-pages/);
  assert.equal(workflows.includes(providerSecret), false);
  assert.equal(
    /models:evaluate|models:targets|probe-targets|api\.openai\.com/i.test(
      workflows,
    ),
    false,
  );
  assert.equal(
    /pending-events|PENDING_REVIEW_BRANCH|git show FETCH_HEAD|git ls-remote/.test(
      `${workflows}\n${runner}`,
    ),
    false,
  );
});
