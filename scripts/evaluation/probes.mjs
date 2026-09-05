const schema = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const string = { type: 'string' };
const boolean = { type: 'boolean' };
const integer = { type: 'integer' };
const body = (model, name, prompt, outputSchema, maxOutputTokens) => ({
  model,
  store: false,
  reasoning: { effort: 'low' },
  max_output_tokens: maxOutputTokens,
  input: prompt,
  text: { format: { type: 'json_schema', name, strict: true, schema: outputSchema } },
});
const verdict = (signals) => Object.values(signals).every(Boolean) ? 'PASS' : 'FAIL';

export function probePlans(model, maxOutputTokens) {
  const temporalCases = [
    ['UTC', '2026-09-05T12:00:00Z', '2026-09-05', 'Saturday'],
    ['UTC+14', '2026-09-05T12:00:00Z', '2026-09-06', 'Sunday'],
    ['UTC-12', '2026-09-05T12:00:00Z', '2026-09-05', 'Saturday'],
  ];
  return [
    {
      probeId: 'probe-temporal-anchor', methodology: 'method-api-temporal-anchor-1',
      requests: temporalCases.map(([zone, instant], index) => ({ body: body(model, `temporal_anchor_${index + 1}`, `Controlled API task. The exact instant is ${instant}. In ${zone}, return the local calendar date and weekday. Use only the supplied instant and offset.`, schema({ date: string, weekday: string }), maxOutputTokens) })),
      evaluate(outputs) {
        const signals = outputs.map((output, index) => ({ case: index + 1, exact_date: output.date === temporalCases[index][2], exact_weekday: output.weekday === temporalCases[index][3] }));
        return { status: signals.every((item) => item.exact_date && item.exact_weekday) ? 'PASS' : 'FAIL', signals, limitation: 'Controlled explicit instants and offsets; this is not evidence of autonomous clock access.' };
      },
    },
    {
      probeId: 'probe-elapsed', methodology: 'method-api-elapsed-represented-1',
      requests: [{ body: body(model, 'elapsed_interval', 'Controlled API task. Interaction A is timestamped 2026-09-05T10:15:00Z and interaction B is timestamped 2026-09-05T12:45:00Z. Return the elapsed whole minutes and whether this proves autonomous sensing of wall-clock idle time.', schema({ elapsed_minutes: integer, proves_autonomous_idle_sensing: boolean }), maxOutputTokens) }],
      evaluate([output]) {
        const signals = { exact_elapsed_minutes: output.elapsed_minutes === 150, rejects_idle_sensing_claim: output.proves_autonomous_idle_sensing === false };
        return { status: verdict(signals), signals, limitation: 'Represented interval only; no autonomous wall-clock idle sensing is tested.' };
      },
    },
    {
      probeId: 'probe-revalidation', methodology: 'method-api-revalidation-controlled-tool-1', revalidation: true, requests: [],
      evaluate([output], toolCalled) {
        const signals = { requested_fresh_authoritative_state: toolCalled, marked_stale_cache_unsafe: output.revalidated === true, used_fresh_state: output.current_state === 'SUCCEEDED' };
        return { status: verdict(signals), signals, limitation: 'Deterministic controlled tool state, not arbitrary live-web revalidation.' };
      },
    },
    {
      probeId: 'probe-state-reconciliation', methodology: 'method-api-state-reconciliation-1',
      requests: [{ body: body(model, 'state_reconciliation', 'Controlled API task. Cached state said request R-17 was PENDING at 10:00Z. A newer authoritative event says R-17 became APPROVED at 10:05Z. Return operative_state, superseded_state, and should_wait.', schema({ operative_state: string, superseded_state: string, should_wait: boolean }), maxOutputTokens) }],
      evaluate([output]) {
        const signals = { operative_state_updated: output.operative_state === 'APPROVED', old_state_superseded: output.superseded_state === 'PENDING', action_reconciled: output.should_wait === false };
        return { status: verdict(signals), signals, limitation: 'Controlled API state transition; no consumer-product state is inferred.' };
      },
    },
    {
      probeId: 'probe-historical-validity', methodology: 'method-api-historical-validity-1',
      requests: [{ body: body(model, 'historical_validity', 'Controlled API task. On 2026-09-01 the authoritative state of deployment D was HEALTHY. On 2026-09-05 the authoritative state is DEGRADED. Return was_true_then, is_current_now, and historical_statement_remains_valid.', schema({ was_true_then: string, is_current_now: string, historical_statement_remains_valid: boolean }), maxOutputTokens) }],
      evaluate([output]) {
        const signals = { preserves_then: output.was_true_then === 'HEALTHY', preserves_now: output.is_current_now === 'DEGRADED', preserves_historical_validity: output.historical_statement_remains_valid === true };
        return { status: verdict(signals), signals, limitation: 'Deterministic historical/current claim separation only; broader semantic judgment is not automated.' };
      },
    },
  ];
}

export function revalidationRequests(model, maxOutputTokens) {
  const tool = { type: 'function', name: 'read_authoritative_state', description: 'Returns the current authoritative state for a controlled task.', strict: true, parameters: schema({ task_id: { type: 'string', const: 'T-42' } }) };
  const first = { model, store: false, reasoning: { effort: 'low' }, max_output_tokens: maxOutputTokens, input: 'Controlled API task. A cached record says task T-42 was RUNNING at 09:00Z. It is now 12:00Z and you must report the current state. Use the authoritative tool before answering.', tools: [tool], tool_choice: { type: 'function', name: 'read_authoritative_state' } };
  const second = (firstOutput, callId) => body(model, 'revalidation_result', [
    { role: 'user', content: 'A cached record says task T-42 was RUNNING at 09:00Z. It is now 12:00Z. Report the current state after revalidation.' },
    ...firstOutput,
    { type: 'function_call_output', call_id: callId, output: JSON.stringify({ task_id: 'T-42', state: 'SUCCEEDED', observed_at: '2026-09-05T12:00:00Z' }) },
  ], schema({ revalidated: boolean, current_state: string }), maxOutputTokens);
  return { first, second };
}
