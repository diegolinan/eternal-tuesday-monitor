import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  assessModelAdoption,
  buildAdoptionRegister,
  resolveApiAvailability,
} from '../scripts/evaluation/adoption.mjs';

const policy = JSON.parse(
  await readFile(
    new URL('../config/model-evaluation-policy.json', import.meta.url),
  ),
);
const probes = [
  ['probe-temporal-anchor', 'TEMPORAL ANCHOR'],
  ['probe-elapsed', 'ELAPSED'],
  ['probe-revalidation', 'REVALIDATION'],
  ['probe-state-reconciliation', 'STATE RECONCILIATION'],
  ['probe-historical-validity', 'HISTORICAL VALIDITY'],
].map(([id, name]) => ({ id, name }));
const sourceConfig = [
  {
    id: 'discovery-openai-docs',
    vendor_id: 'vendor-openai',
    type: 'official-model-index',
  },
  {
    id: 'discovery-openai-api',
    vendor_id: 'vendor-openai',
    type: 'authenticated-model-list',
  },
];
const model = (id = 'model-fixture', apiId = 'gpt-fixture') => ({
  id,
  vendor_id: 'vendor-openai',
  display_name: 'Fixture model',
  api_model_id: apiId,
  release_state: 'DISCOVERED',
  api_state: 'API_UNKNOWN',
  account_access: 'UNKNOWN',
  endpoints: ['responses'],
  capabilities: [
    'function_calling',
    'snapshot_pinning',
    'structured_outputs',
    'text_input_output',
  ],
  supported_parameters: [],
  provenance: [
    {
      source_id: 'discovery-openai-docs',
      url: `https://developers.openai.com/api/docs/models/${apiId}`,
    },
  ],
  review_reasons: [],
});
const missingCredential = [
  {
    source_id: 'discovery-openai-api',
    vendor_id: 'vendor-openai',
    status: 'CREDENTIAL_NOT_CONFIGURED',
  },
];

test('missing provider credentials block an otherwise compatible exact model without a fake result', () => {
  const record = assessModelAdoption({
    model: model(),
    eventId: 'discovery-fixture',
    policy,
    probes,
    observations: [],
    sourceOutcomes: missingCredential,
    sourceConfig,
    asOf: '2026-09-05',
  });
  assert.equal(record.api_availability.state, 'AUTH_REQUIRED_TO_VERIFY');
  assert.equal(record.testability_state, 'PARTIALLY_TESTABLE');
  assert.equal(record.probes[0].state, 'BLOCKED');
  assert.equal(
    record.probes[0].methodology_version_id,
    'method-api-temporal-anchor-1',
  );
  assert.ok(record.probes.every((item) => item.state === 'BLOCKED'));
  assert.equal(record.queue.state, 'BLOCKED');
  assert.equal(record.queue.execution_authorized, false);
  assert.equal('verdict' in record, false);
  assert.equal('result_status_id' in record, false);
});

test('account-visible allowlisted model becomes eligible under bounded execution policy', () => {
  const available = {
    ...model('model-fixture', 'gpt-6-astra'),
    api_state: 'API_AVAILABLE',
    account_access: 'ACCESS_CONFIRMED',
  };
  const record = assessModelAdoption({
    model: available,
    eventId: 'discovery-fixture',
    policy,
    probes,
    observations: [],
    sourceOutcomes: [{ source_id: 'discovery-openai-api', status: 'OK' }],
    sourceConfig,
    asOf: '2026-09-05',
  });
  assert.equal(record.api_availability.state, 'AVAILABLE');
  assert.equal(record.probes[0].state, 'ELIGIBLE');
  assert.equal(record.queue.state, 'ELIGIBILITY_READY');
  assert.equal(record.queue.execution_authorized, true);
  assert.ok(record.queue.reasons.includes('INITIAL_BASELINE_READY'));
});

test('transport failures remain operational UNKNOWN and never become behavioral FAIL', () => {
  const availability = resolveApiAvailability(
    model(),
    [{ source_id: 'discovery-openai-api', status: 'NETWORK_ERROR' }],
    sourceConfig,
  );
  assert.equal(availability.state, 'UNKNOWN');
  assert.deepEqual(availability.reasons, ['API_CHECK_NETWORK_ERROR']);
  assert.equal(JSON.stringify(availability).includes('FAIL'), false);
});

test('compatibility is driven by generic metadata and not a named-model exception', async () => {
  const register = buildAdoptionRegister({
    models: [model('arbitrary-model', 'gpt-arbitrary-horizon')],
    events: [
      {
        id: 'discovery-arbitrary',
        model: model('arbitrary-model', 'gpt-arbitrary-horizon'),
      },
    ],
    catalog: [
      { id: 'arbitrary-model', relevance_state: 'DISCOVERED_RELEVANT' },
    ],
    policy,
    probes,
    observations: [],
    sourceOutcomes: missingCredential,
    sourceConfig,
    asOf: '2026-09-05',
  });
  assert.equal(register.records[0].probes[0].state, 'BLOCKED');
  const implementation = await readFile(
    new URL('../scripts/evaluation/adoption.mjs', import.meta.url),
    'utf8',
  );
  assert.equal(implementation.toLowerCase().includes('astra'), false);
});

test('undocumented required primitives fail closed per probe', () => {
  const record = assessModelAdoption({
    model: { ...model(), capabilities: [] },
    eventId: 'discovery-fixture',
    policy,
    probes,
    observations: [],
    sourceOutcomes: missingCredential,
    sourceConfig,
    asOf: '2026-09-05',
  });
  assert.equal(record.probes[0].state, 'NOT_TESTABLE');
  assert.ok(
    record.probes[0].reasons.includes(
      'CAPABILITY_NOT_DOCUMENTED_SNAPSHOT_PINNING',
    ),
  );
});

test('unchanged eligibility preserves its original assessment date and cannot create a daily rerun loop', () => {
  const args = {
    model: model(),
    eventId: 'discovery-fixture',
    policy,
    probes,
    observations: [],
    sourceOutcomes: missingCredential,
    sourceConfig,
  };
  const first = assessModelAdoption({ ...args, asOf: '2026-09-05' });
  const second = assessModelAdoption({
    ...args,
    asOf: '2026-09-06',
    prior: first,
  });
  assert.equal(second.assessed_on, '2026-09-05');
  assert.equal(policy.scheduling.rerun_unchanged_models, false);
  assert.equal(policy.execution_enabled, true);
  assert.equal(policy.limits.max_scheduled_requests_per_day, 8);
  assert.equal(policy.limits.max_scheduled_spend_usd_per_day, 0.5);
  assert.equal(policy.limits.max_retries, 0);
  assert.equal(policy.limits.max_concurrency, 1);
});

test('raw provenance policy is complete and operational errors cannot be behavioral failures', () => {
  const required = new Set(policy.provenance_contract.required_fields);
  for (const field of [
    'provider_id',
    'requested_model_id',
    'returned_model_id',
    'surface_id',
    'endpoint',
    'executed_at',
    'methodology_version_id',
    'messages',
    'parameters',
    'tool_definitions',
    'raw_response',
    'normalized_evaluation',
    'evaluator_version',
    'originating_discovery_event_id',
    'commit_sha',
    'operational_errors',
  ])
    assert.ok(required.has(field), field);
  assert.equal(
    policy.provenance_contract.operational_errors_are_behavioral_failures,
    false,
  );
});

test('operational failures cool down and become retryable without becoming behavioral evidence', () => {
  const available = { ...model('model-fixture', 'gpt-6-astra'), api_state: 'API_AVAILABLE', account_access: 'ACCESS_CONFIRMED' };
  const result = { model_id: available.id, status: 'OPERATIONAL_ERROR', executed_at: '2026-09-05T12:00:00Z' };
  const args = { model: available, eventId: 'discovery-fixture', policy, probes, observations: [], evaluationResults: [result], sourceOutcomes: [{ source_id: 'discovery-openai-api', status: 'OK' }], sourceConfig };
  const cooling = assessModelAdoption({ ...args, asOf: '2026-09-05' });
  assert.equal(cooling.queue.state, 'RETEST_POLICY');
  assert.equal(cooling.queue.execution_authorized, false);
  const retryable = assessModelAdoption({ ...args, asOf: '2026-09-13' });
  assert.equal(retryable.queue.state, 'ELIGIBILITY_READY');
  assert.equal(retryable.queue.execution_authorized, true);
  assert.equal(retryable.execution_state, 'OPERATIONAL_ERROR');
});
