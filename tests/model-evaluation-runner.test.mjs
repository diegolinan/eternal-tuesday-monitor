import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { probePlans } from '../scripts/evaluation/probes.mjs';

const policy = JSON.parse(
  await readFile(new URL('../config/model-evaluation-policy.json', import.meta.url)),
);

test('five bounded deterministic API methodologies fit the hard production budget', () => {
  const plans = probePlans('gpt-future-frontier', policy.execution.max_output_tokens_per_request);
  assert.equal(plans.length, 5);
  assert.deepEqual(
    plans.map((plan) => plan.probeId),
    policy.execution.probe_allowlist,
  );
  const requests = plans.reduce(
    (count, plan) => count + (plan.revalidation ? 2 : plan.requests.length),
    0,
  );
  assert.equal(requests, 8);
  assert.ok(requests <= policy.limits.max_requests_per_run);
  const reserved =
    requests *
    ((policy.execution.request_body_max_bytes *
      policy.execution.cost_preflight.input_usd_per_million_ceiling +
      policy.execution.max_output_tokens_per_request *
        policy.execution.cost_preflight.output_usd_per_million_ceiling) /
      1_000_000);
  assert.ok(reserved <= policy.limits.max_scheduled_spend_usd_per_day);
  assert.equal(policy.limits.max_retries, 0);
  assert.equal(policy.limits.max_concurrency, 1);
});

test('production evaluation logic contains no named Astra exception', async () => {
  for (const file of ['../scripts/evaluation/probes.mjs', '../scripts/evaluation/runner.mjs']) {
    const implementation = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.equal(implementation.toLowerCase().includes('astra'), false);
  }
});
