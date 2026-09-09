import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));

test('the four reviewed leads are routed into five exact-model targets', async () => {
  const plan = await readJson(
    'data/evidence-discovery/reproduction-targets.json',
  );
  const candidateIds = new Set(
    plan.targets.map((target) => target.candidate_id),
  );
  assert.deepEqual(
    candidateIds,
    new Set([
      'evcand-512fb0b26a7db7014860961a',
      'evcand-77d1780bfce3d9384ae3d724',
      'evcand-90f007ec250d7a04474929fb',
      'evcand-c894d2c8a57c50f1c3db87ca',
    ]),
  );
  assert.equal(plan.targets.length, 5);

  const bundled = plan.targets.filter(
    (target) => target.candidate_id === 'evcand-77d1780bfce3d9384ae3d724',
  );
  assert.deepEqual(
    new Set(bundled.map((target) => target.model_id)),
    new Set(['model-claude-opus-5', 'model-fable-5']),
  );
});

test('Fable 5 targets cannot silently substitute Fable 5.1', async () => {
  const plan = await readJson(
    'data/evidence-discovery/reproduction-targets.json',
  );
  const fableTargets = plan.targets.filter(
    (target) => target.model_id === 'model-fable-5',
  );
  assert.equal(fableTargets.length, 3);
  assert.ok(
    fableTargets.every(
      (target) =>
        target.readiness === 'COMPLETED_ACCEPTED_EVIDENCE' ||
        target.readiness === 'READY_FOR_CREDENTIAL_PROVISIONING' ||
        target.readiness === 'BLOCKED_EXACT_MODEL_AVAILABILITY' ||
        target.readiness === 'NEEDS_SURFACE_SELECTION' ||
        target.readiness === 'INTERACTIVE_HOST_REQUIRED',
    ),
  );
  assert.match(JSON.stringify(fableTargets), /Fable 5\.1 is not a substitute/);
  assert.doesNotMatch(
    JSON.stringify(fableTargets),
    /"model_id":"model-fable-5-1"/,
  );
});

test('completed reproduction targets point to accepted evidence and have no blockers', async () => {
  const [plan, evidence] = await Promise.all([
    readJson('data/evidence-discovery/reproduction-targets.json'),
    readJson('data/evidence/evidence.json'),
  ]);
  const evidenceIds = new Set(
    evidence.evidence_records.map((record) => record.id),
  );
  const completed = plan.targets.filter(
    (target) => target.readiness === 'COMPLETED_ACCEPTED_EVIDENCE',
  );

  assert.equal(completed.length, 1);
  assert.deepEqual(completed[0].blockers, []);
  assert.equal(completed[0].completion.completed_on, '2026-09-09');
  assert.ok(evidenceIds.has(completed[0].completion.evidence_id));
});

test('server and interactive surfaces use different protocols', async () => {
  const policy = await readJson('config/surface-reproduction-policy.json');
  assert.equal(policy.automatic_execution, false);
  assert.equal(policy.automatic_evidence_acceptance, false);
  assert.equal(policy.cross_surface_transfer, false);

  const protocols = new Map(
    policy.protocols.map((protocol) => [protocol.id, protocol]),
  );
  assert.equal(
    protocols.get('protocol-terminal-agent-v1').execution_class,
    'SERVER_CAPABLE_EXACT_PRODUCT_BINARY',
  );
  assert.equal(
    protocols.get('protocol-ide-extension-v1').execution_class,
    'INTERACTIVE_HOST_REQUIRED',
  );
  assert.equal(
    protocols.get('protocol-desktop-app-v1').execution_class,
    'INTERACTIVE_HOST_REQUIRED',
  );
  assert.equal(
    protocols.get('protocol-provider-api-v1').implementation_state,
    'IMPLEMENTED',
  );
  assert.ok(
    policy.protocols
      .filter((protocol) => protocol.id !== 'protocol-provider-api-v1')
      .every(
        (protocol) => protocol.implementation_state === 'PROTOCOL_DEFINED',
      ),
  );
});

test('every protocol preserves all five probe identities', async () => {
  const policy = await readJson('config/surface-reproduction-policy.json');
  const probes = await readJson('data/catalog/probes.json');
  const expected = new Set(probes.probes.map((probe) => probe.id));
  for (const protocol of policy.protocols)
    assert.deepEqual(new Set(protocol.probe_ids), expected, protocol.id);
});
