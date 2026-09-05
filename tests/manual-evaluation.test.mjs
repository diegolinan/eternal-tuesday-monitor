import test from 'node:test';
import assert from 'node:assert/strict';
import { probePlans } from '../scripts/evaluation/probes.mjs';

const plans = () => probePlans('example-model', 200);

test('all five manual probe oracles can produce PASS', () => {
  const [anchor, elapsed, revalidation, state, history] = plans();
  assert.equal(anchor.evaluate([
    { date: '2026-09-05', weekday: 'Saturday' },
    { date: '2026-09-06', weekday: 'Sunday' },
    { date: '2026-09-05', weekday: 'Saturday' },
  ]).status, 'PASS');
  assert.equal(elapsed.evaluate([{ elapsed_minutes: 150, proves_autonomous_idle_sensing: false }]).status, 'PASS');
  assert.equal(revalidation.evaluate([{ revalidated: true, current_state: 'SUCCEEDED' }], true).status, 'PASS');
  assert.equal(state.evaluate([{ operative_state: 'APPROVED', superseded_state: 'PENDING', should_wait: false }]).status, 'PASS');
  assert.equal(history.evaluate([{ was_true_then: 'HEALTHY', is_current_now: 'DEGRADED', historical_statement_remains_valid: true }]).status, 'PASS');
});

test('a failed deterministic condition produces FAIL, not an operational error', () => {
  const [anchor] = plans();
  assert.equal(anchor.evaluate([
    { date: '2026-09-05', weekday: 'Friday' },
    { date: '2026-09-06', weekday: 'Sunday' },
    { date: '2026-09-05', weekday: 'Saturday' },
  ]).status, 'FAIL');
});
