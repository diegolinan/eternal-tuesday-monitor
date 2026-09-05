import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fact } from '../scripts/discovery/adapters/common.mjs';
import * as openai from '../scripts/discovery/adapters/openai.mjs';
import * as anthropic from '../scripts/discovery/adapters/anthropic.mjs';
import * as google from '../scripts/discovery/adapters/google.mjs';
import { parseListing } from '../scripts/discovery/adapters/api.mjs';
import {
  normalizeDiscoveries,
  proposeEvents,
  latestModels,
  eligibility,
  supersessionEvents,
  applyAvailabilityFailures,
  evaluationLifecycle,
} from '../scripts/discovery/lifecycle.mjs';
import { evaluateObservationFreshness } from '../scripts/lib/freshness.mjs';
import { projectModels } from '../scripts/discovery/project.mjs';
import { readOfficial } from '../scripts/discovery/fetch.mjs';

const source = {
  id: 'fixture-source',
  vendor_id: 'vendor-openai',
  url: 'https://official.example/models',
  adapter: 'openai-docs',
  type: 'official-model-index',
  allowed_domains: ['official.example'],
  id_pattern: '^gpt-[a-z0-9.-]+$',
};
const provenance = (url = source.url) => [
  {
    source_id: source.id,
    url,
    checked_on: '2026-09-04',
    sha256: 'a'.repeat(64),
    parser_version: '1',
  },
];
const sample = (extra = {}) =>
  fact(source, {
    display_name: 'GPT Future',
    api_model_id: 'gpt-future',
    provenance: provenance(),
    ...extra,
  });
const normalize = (facts, previous = []) =>
  normalizeDiscoveries(facts, previous, [], '2026-09-04');
const policy = {
  providers: ['vendor-openai'],
  denied_api_ids: [],
  max_access_check_age_days: 7,
  supersession_retest_enabled: true,
  methodologies: [
    {
      id: 'fixture-approved-api',
      status: 'approved',
      provider_id: 'vendor-openai',
      api_surface_id: 'surface-api',
      endpoint: 'responses',
      required_capabilities: ['tools'],
      required_parameters: ['max_output_tokens'],
    },
  ],
};
const callable = () =>
  normalize([
    sample({
      api_state: 'API_AVAILABLE',
      account_access: 'ACCESS_CONFIRMED',
      endpoints: ['responses'],
      capabilities: ['tools'],
      supported_parameters: ['max_output_tokens'],
    }),
  ])[0];

test('availability failures preserve prior identity but block readiness', () => {
  const previous = [callable()];
  const before = structuredClone(previous);
  const result = applyAvailabilityFailures(
    [],
    previous,
    [{ source_id: source.id, status: 'ACCOUNT_ACCESS_DENIED' }],
    [{ ...source, type: 'authenticated-model-list' }],
    '2026-09-05',
  );
  assert.equal(result[0].api_state, 'API_AVAILABLE');
  assert.equal(result[0].account_access, 'ACCESS_DENIED');
  assert.equal(eligibility(result[0], policy, '2026-09-05').targets.length, 0);
  assert.deepEqual(previous, before);
});

test('capabilities removed from current metadata do not accumulate forever', () => {
  const current = callable();
  const next = normalize(
    [
      sample({
        api_state: 'API_AVAILABLE',
        account_access: 'ACCESS_CONFIRMED',
        endpoints: ['responses'],
      }),
    ],
    [current],
  )[0];
  assert.deepEqual(next.capabilities, []);
  assert.equal(eligibility(next, policy, '2026-09-04').targets.length, 0);
});

test('possible abbreviated catalog identity is flagged, not silently mapped', () => {
  const models = normalizeDiscoveries(
    [sample({ display_name: 'GPT Future Model' })],
    [],
    [{ id: 'model-prior', vendor_id: 'vendor-openai', name: 'Future Model' }],
    '2026-09-04',
  );
  assert.ok(
    models[0].review_reasons.includes('POSSIBLE_EXISTING_CATALOG_IDENTITY'),
  );
});

test('new official model discovered without a temporal result', () => {
  const [model] = normalize([sample()]);
  assert.equal(model.display_name, 'GPT Future');
  assert.equal(model.discovered_on, '2026-09-04');
  assert.equal(model.first_tested_on, null);
  assert.equal(model.released_on, null);
  assert.equal('observedResult' in model, false);
});
test('same exact model from two official sources has one identity and both provenance records', () => {
  const models = normalize([
    sample(),
    sample({ provenance: provenance('https://official.example/another') }),
  ]);
  assert.equal(models.length, 1);
  assert.equal(models[0].provenance.length, 2);
});
test('marketing-only identity remains unknown until an authoritative exact ID arrives', () => {
  const [first] = normalize([
    sample({ api_model_id: null, api_state: 'API_PENDING' }),
  ]);
  assert.equal(first.api_model_id, null);
  const [later] = normalizeDiscoveries(
    [
      sample({
        api_state: 'API_AVAILABLE',
        account_access: 'ACCESS_CONFIRMED',
      }),
    ],
    [first],
    [],
    '2026-09-05',
  );
  assert.equal(later.id, first.id);
  assert.equal(later.discovered_on, '2026-09-04');
  assert.equal(later.api_available_on, '2026-09-05');
  assert.equal(later.api_model_id, 'gpt-future');
  assert.equal(later.review_reasons.length, 0);
});
test('account denial is not model nonexistence and never mutates known state', async () => {
  const before = [callable()];
  const saved = structuredClone(before);
  await assert.rejects(
    () =>
      readOfficial(
        source.url,
        source,
        { timeout_ms: 1000, max_response_bytes: 1000 },
        async () => new Response('', { status: 403 }),
      ),
    /ACCOUNT_ACCESS_DENIED/,
  );
  assert.deepEqual(
    proposeEvents(normalize([], before), before, '2026-09-04'),
    [],
  );
  assert.deepEqual(before, saved);
});
test('compatible model becomes data-driven PROBE_ELIGIBLE without enabling execution', () => {
  const result = eligibility(callable(), policy, '2026-09-04');
  assert.equal(result.state, 'PROBE_ELIGIBLE');
  assert.equal(result.targets[0].execution_enabled, false);
  assert.equal(result.targets[0].surface, 'PROVIDER_API');
});
test('incompatible endpoint or required parameter remains HARNESS_UNSUPPORTED', () => {
  assert.equal(
    eligibility({ ...callable(), endpoints: [] }, policy, '2026-09-04').state,
    'HARNESS_UNSUPPORTED',
  );
  assert.equal(
    eligibility(
      { ...callable(), supported_parameters: [] },
      policy,
      '2026-09-04',
    ).state,
    'HARNESS_UNSUPPORTED',
  );
});
test('no approved methodology and stale account checks fail closed', () => {
  assert.equal(
    eligibility(callable(), { ...policy, methodologies: [] }, '2026-09-04')
      .targets.length,
    0,
  );
  assert.equal(eligibility(callable(), policy, '2026-09-15').targets.length, 0);
});
test('new API models cannot mark consumer-product observations as API tests', () => {
  const model = callable();
  const events = proposeEvents([model], [], '2026-09-04');
  const observations = [
    {
      model_id: model.id,
      surface_id: 'surface-chatgpt',
      methodology_version_id: 'fixture-approved-api',
      evidence_class_id: 'evidence-controlled-experiment',
      observation_date: { value: '2026-09-04', precision: 'day' },
      result_status_id: 'OBSERVED_FAILURE',
    },
  ];
  const before = structuredClone(observations);
  const view = projectModels(
    events,
    observations,
    policy,
    new Map([['vendor-openai', { name: 'OpenAI' }]]),
    '2026-09-04',
  );
  assert.equal(view[0].lifecycleState, 'TESTED');
  assert.equal(view[0].surfaces.length, 1);
  assert.equal(view[0].surfaces[0].kind, 'CONSUMER_PRODUCT_SURFACE');
  assert.deepEqual(observations, before);
});
test('deprecated model remains in history and cannot become a target', () => {
  const first = callable();
  const events = proposeEvents([first], [], '2026-09-04');
  const retired = normalize([sample({ release_state: 'DEPRECATED' })], [first]);
  const all = [...events, ...proposeEvents(retired, [first], '2026-09-05')];
  assert.equal(latestModels(all).length, 1);
  assert.equal(eligibility(retired[0], policy, '2026-09-05').targets.length, 0);
  assert.equal(all[0].model.release_state, 'DISCOVERED');
});
test('only explicit same-vendor supersession propagates a retest', () => {
  const model = { ...callable(), supersedes_model_id: 'model-old' };
  const events = supersessionEvents(
    [model],
    [
      { id: 'model-old', vendor_id: 'vendor-openai' },
      {
        id: model.id,
        vendor_id: 'vendor-openai',
        supersedes_model_id: 'model-old',
        supersession_review: { status: 'REVIEWED_ACCEPTED' },
      },
    ],
    policy,
    '2026-09-04',
  );
  assert.equal(events.length, 1);
  assert.equal(
    supersessionEvents(
      [{ ...model, supersedes_model_id: null }],
      [],
      policy,
      '2026-09-04',
    ).length,
    0,
  );
  const observation = {
    id: 'obs',
    model_id: 'model-old',
    record_states: ['CURRENT'],
    last_verified_on: '2026-09-03',
    evidence_class_id: 'evidence-test',
  };
  const result = evaluateObservationFreshness({
    observation,
    evidenceRecord: { id: 'e' },
    sourceIds: [],
    policy: {
      rules: [{ evidence_class_id: 'evidence-test', max_age_days: 30 }],
    },
    events,
    asOf: '2026-09-04',
  });
  assert.ok(result.sufficiencyReasons.includes('MODEL_SUPERSEDED'));
});
test('broken official adapter fails instead of reporting an empty catalog', () => {
  assert.throws(
    () => anthropic.index('<html>maintenance</html>', source),
    /TABLE_MISSING/,
  );
  assert.throws(
    () => google.index('<html>maintenance</html>', source),
    /TABLE_MISSING/,
  );
  assert.throws(
    () =>
      parseListing('{"error":"denied"}', { ...source, adapter: 'openai-api' }),
    /LIST_MISSING/,
  );
});
test('source disagreement creates review rather than eligibility', () => {
  const [model] = normalize([
    sample({ api_state: 'API_PENDING' }),
    sample({ api_state: 'API_AVAILABLE', account_access: 'ACCESS_CONFIRMED' }),
  ]);
  assert.ok(model.review_reasons.includes('CONFLICT_API_AVAILABILITY'));
  assert.equal(eligibility(model, policy, '2026-09-04').targets.length, 0);
});
test('same display name with different exact IDs is not merged as an alias', () => {
  const models = normalize([sample(), sample({ api_model_id: 'gpt-another' })]);
  assert.equal(models.length, 2);
  assert.ok(
    models.every((m) => m.review_reasons.includes('AMBIGUOUS_DISPLAY_NAME')),
  );
});
test('OpenAI parser discovers an arbitrary next model, verifies snapshot ID, and preserves pending rollout', () => {
  const src = {
    ...source,
    url: 'https://official.example/api/docs/models/all',
  };
  const urls = openai.index(
    '<main><a href="/api/docs/models/gpt-next">GPT Next</a><a href="https://attacker.example/api/docs/models/gpt-evil">Bad</a></main>',
    src,
  );
  assert.equal(urls.length, 1);
  const html =
    '<meta property="og:title" content="GPT Next Model | OpenAI API"><main><p>API access coming in the next days.</p><div>Snapshots</div><div>Snapshots and aliases</div><div>gpt-next</div><div>Rate limits</div></main>';
  const model = openai.detail(html, src, urls[0]);
  assert.equal(model.api_model_id, 'gpt-next');
  assert.equal(model.api_state, 'API_PENDING');
  assert.equal(
    openai.detail(html.replace('gpt-next', 'different'), src, urls[0])
      .api_model_id,
    null,
  );
});
test('Gemini endpoint table and Claude API row, not marketing names, establish IDs', () => {
  const g = google.index(
    '<main><table><tr><td>Gemini New</td><td>gemini-new</td></tr></table></main>',
    { ...source, id_pattern: '^gemini-[a-z-]+$' },
  );
  assert.equal(g[0].api_model_id, 'gemini-new');
  const a = anthropic.index(
    '<main><table><tr><th>Feature</th><th><a>Claude New</a></th></tr><tr><td>Claude API ID</td><td>claude-new</td></tr></table></main>',
    { ...source, id_pattern: '^claude-[a-z-]+$' },
  );
  assert.equal(a[0].api_model_id, 'claude-new');
});

test('OpenAI endpoint navigation is not a supported endpoint claim', () => {
  const html = '<meta property="og:title" content="GPT Example Model | OpenAI API"><main>Endpoints v1/responses Unsupported Snapshots gpt-example Rate limits</main>';
  const model = openai.detail(html, source, 'https://official.example/api/docs/models/gpt-example');
  assert.deepEqual(model.endpoints, []);
});

test('reviewed exact API identity reuses the original abbreviated catalog ID', () => {
  const [reviewed] = normalize([sample({ display_name: 'GPT Future Model' })]);
  reviewed.id = 'model-prior';
  const next = normalizeDiscoveries(
    [sample({ display_name: 'GPT Future Model' })],
    [reviewed],
    [{ id: 'model-prior', vendor_id: 'vendor-openai', name: 'Future Model' }],
    '2026-09-05',
  );
  assert.equal(next.length, 1);
  assert.equal(next[0].id, 'model-prior');
  assert.deepEqual(next[0].review_reasons, []);
});
test('official fetch rejects redirected foreign hosts and excessive responses', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      readOfficial(
        source.url,
        source,
        { timeout_ms: 1000, max_response_bytes: 1000 },
        async () => {
          calls++;
          return new Response('', {
            status: 302,
            headers: { location: 'https://attacker.example' },
          });
        },
      ),
    /ALLOWLIST/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    () =>
      readOfficial(
        source.url,
        source,
        { timeout_ms: 1000, max_response_bytes: 3 },
        async () => new Response('oversized'),
      ),
    /TOO_LARGE/,
  );
});

test('Astra parser replay is deterministic, deduplicated and creates no observation or verdict', async () => {
  const root = new URL('./fixtures/model-discovery/', import.meta.url);
  const catalog = JSON.parse(
    await readFile(new URL('pre-pr-1-catalog.json', root), 'utf8'),
  );
  const replay = JSON.parse(
    await readFile(new URL('astra-parser-replay.json', root), 'utf8'),
  );
  assert.equal(replay.quality, 'PARSER_REPLAY_NORMALIZED_FACT');
  assert.equal(
    catalog.models.some((model) => model.id === replay.expected_id),
    false,
  );
  const first = normalizeDiscoveries(
    [replay.fact],
    [],
    catalog.models,
    replay.as_of,
  );
  assert.equal(first.length, 1);
  assert.equal(first[0].id, replay.expected_id);
  assert.equal(first[0].provenance.length, 2);
  const events = proposeEvents(first, [], replay.as_of);
  assert.equal(events.length, 1);
  assert.equal('observedResult' in events[0], false);
  assert.equal('observation' in events[0], false);
  const second = normalizeDiscoveries(
    [replay.fact],
    first,
    [...catalog.models, { id: first[0].id, vendor_id: first[0].vendor_id, name: first[0].display_name }],
    replay.as_of,
  );
  assert.equal(proposeEvents(second, first, replay.as_of).length, 0);
  const parser = await readFile(
    new URL('../scripts/discovery/adapters/openai.mjs', import.meta.url),
    'utf8',
  );
  assert.equal(parser.toLowerCase().includes('astra'), false);
});

test('arbitrary model follows the same lifecycle without a special case', () => {
  const arbitrary = sample({
    display_name: 'Arbitrary Horizon Model',
    api_model_id: 'gpt-arbitrary-horizon',
  });
  const [model] = normalize([arbitrary]);
  const first = proposeEvents([model], [], '2026-09-04');
  assert.equal(first.length, 1);
  const lifecycle = evaluationLifecycle({
    model,
    observations: [],
    policy: { ...policy, methodologies: [] },
    probes: [
      { id: 'p1', name: 'A' },
      { id: 'p2', name: 'B' },
      { id: 'p3', name: 'C' },
      { id: 'p4', name: 'D' },
      { id: 'p5', name: 'E' },
    ],
    asOf: '2026-09-04',
  });
  assert.equal(lifecycle.lifecycleState, 'DISCOVERED');
  assert.deepEqual(
    lifecycle.probeCoverage.map((probe) => probe.state),
    Array(5).fill('NOT_TESTED'),
  );
});

test('all public lifecycle states are produced from explicit fixture conditions', () => {
  const probes = [1, 2, 3, 4, 5].map((number) => ({
    id: `p${number}`,
    name: `Probe ${number}`,
  }));
  const model = callable();
  const base = { model, observations: [], policy, probes, asOf: '2026-09-04' };
  assert.equal(evaluationLifecycle(base).lifecycleState, 'EVALUATION_AVAILABLE');
  assert.equal(
    evaluationLifecycle({ ...base, pending: true }).lifecycleState,
    'EVALUATION_PENDING',
  );
  assert.equal(
    evaluationLifecycle({ ...base, model: { ...model, api_state: 'API_PENDING' } }).lifecycleState,
    'EVALUATION_NOT_POSSIBLE',
  );
  const tested = {
    id: 'obs-fixture',
    model_id: model.id,
    probe_id: 'p1',
    evidence_class_id: 'evidence-controlled-experiment',
    observation_date: { value: '2026-09-04', precision: 'day' },
    currentSufficiency: 'SUFFICIENT',
  };
  assert.equal(
    evaluationLifecycle({ ...base, observations: [tested] }).lifecycleState,
    'TESTED',
  );
  assert.equal(
    evaluationLifecycle({
      ...base,
      observations: [{ ...tested, currentSufficiency: 'RETEST_REQUIRED' }],
    }).lifecycleState,
    'RETEST_REQUIRED',
  );
});
test('model listing is GET-only and credentials never enter URL or returned artifacts', async () => {
  const src = {
    ...source,
    adapter: 'openai-api',
    type: 'authenticated-model-list',
    credential_env: 'OPENAI_API_KEY',
  };
  const result = await readOfficial(
    src.url,
    src,
    { timeout_ms: 1000, max_response_bytes: 1000 },
    async (url, options) => {
      assert.equal(options.method, 'GET');
      assert.ok(!url.includes('fixture-secret'));
      assert.equal(options.headers.Authorization, 'Bearer fixture-secret');
      return new Response('{"data":[{"id":"gpt-future"}]}');
    },
    { OPENAI_API_KEY: 'fixture-secret' },
  );
  assert.ok(!JSON.stringify(result).includes('fixture-secret'));
});
