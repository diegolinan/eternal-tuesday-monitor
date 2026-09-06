import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assessModelAdoption } from '../scripts/evaluation/adoption.mjs';

const policy = JSON.parse(
  await readFile(
    new URL('../config/model-evaluation-policy.json', import.meta.url),
  ),
);
const probes = JSON.parse(
  await readFile(new URL('../data/catalog/probes.json', import.meta.url)),
).probes;
const model = {
  id: 'model-future',
  vendor_id: 'vendor-openai',
  display_name: 'GPT Future',
  api_model_id: 'gpt-future',
  release_state: 'DISCOVERED',
  api_state: 'API_UNKNOWN',
  account_access: 'UNKNOWN',
  endpoints: [],
  capabilities: [],
  supported_parameters: [],
  provenance: [
    {
      source_id: 'discovery-openai-docs',
      url: 'https://developers.openai.com/api/docs/models/gpt-future',
    },
  ],
  review_reasons: [],
};

test('a public model identity requires method review before it can enter the test queue', () => {
  const record = assessModelAdoption({
    model,
    eventId: 'discovery-future',
    policy,
    probes,
    observations: [],
    sourceOutcomes: [],
    sourceConfig: [],
    asOf: '2026-09-05',
  });
  assert.equal(record.api_availability.state, 'UNKNOWN');
  assert.deepEqual(record.api_availability.reasons, [
    'PUBLIC_SOURCE_IDENTITY_ONLY',
  ]);
  assert.equal(record.queue.state, 'NOT_QUEUED');
  assert.equal(record.queue.execution_authorized, false);
  assert.equal(record.execution_state, 'NOT_RUN');
  assert.ok(record.probes.every((probe) => probe.state === 'REVIEW_REQUIRED'));
  assert.ok(
    record.probes.every((probe) =>
      probe.reasons.includes('BEHAVIORAL_SCOPE_AND_METHOD_REQUIRE_REVIEW'),
    ),
  );
  assert.equal('verdict' in record, false);
  assert.equal(policy.execution_enabled, false);
  assert.equal(policy.discovery_can_create_behavioral_verdicts, false);
});

test('accepted behavioral observations are distinct from discovery and stop the initial test requirement', () => {
  const record = assessModelAdoption({
    model,
    eventId: 'discovery-future',
    policy,
    probes,
    observations: [
      {
        model_id: model.id,
        probe_id: probes[0].id,
        evidence_class_id: 'evidence-controlled-experiment',
      },
    ],
    sourceOutcomes: [],
    sourceConfig: [],
    asOf: '2026-09-05',
  });
  assert.equal(record.queue.state, 'ALREADY_TESTED');
  assert.equal(record.execution_state, 'NOT_RUN');
});
