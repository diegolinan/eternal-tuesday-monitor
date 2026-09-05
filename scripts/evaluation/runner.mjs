import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { probePlans, revalidationRequests } from './probes.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const lines = async (file) => {
  try { return (await readFile(file, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
};
const outputText = (response) => response.output_text ?? response.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
const usageOf = (response) => ({ input_tokens: response.usage?.input_tokens ?? 0, output_tokens: response.usage?.output_tokens ?? 0 });

export async function runEvaluation({ root, fetchImpl = fetch, now = new Date(), commitSha = process.env.GITHUB_SHA ?? 'local', apiKey = process.env.OPENAI_API_KEY }) {
  const policy = await json(path.join(root, 'config/model-evaluation-policy.json'));
  const adoption = await json(path.join(root, 'data/model-evaluation/adoption.json'));
  const prior = await lines(path.join(root, 'data/model-evaluation/results.jsonl'));
  const authorized = adoption.records.filter((record) => record.queue.execution_authorized && record.api_availability.state === 'AVAILABLE');
  const target = authorized.find((record) => policy.eligible_api_ids.includes(record.api_model_id)) ?? authorized[0];
  const stamp = now.toISOString();
  const runId = `eval-${hash(`${stamp}|${target?.model_id ?? 'none'}|${commitSha}`).slice(0, 20)}`;
  const summary = { run_id: runId, status: 'NO_ELIGIBLE_TARGET', provider_requests: 0, inference_requests: 0, cost_usd: 0, model_id: target?.model_id ?? null, api_model_id: target?.api_model_id ?? null, results: [] };
  if (!target || prior.some((item) => item.model_id === target.model_id && item.status !== 'OPERATIONAL_ERROR')) return summary;
  if (!apiKey) return { ...summary, status: 'CREDENTIAL_NOT_CONFIGURED' };
  const plans = probePlans(target.api_model_id, policy.execution.max_output_tokens_per_request).filter((plan) => policy.execution.probe_allowlist.includes(plan.probeId) && target.probes.some((probe) => probe.probe_id === plan.probeId && probe.state === 'ELIGIBLE'));
  const inferenceCount = plans.reduce((count, plan) => count + (plan.revalidation ? 2 : plan.requests.length), 0);
  const reservedCost = inferenceCount * ((policy.execution.request_body_max_bytes * policy.execution.cost_preflight.input_usd_per_million_ceiling + policy.execution.max_output_tokens_per_request * policy.execution.cost_preflight.output_usd_per_million_ceiling) / 1_000_000);
  if (inferenceCount > policy.limits.max_requests_per_run || inferenceCount > policy.limits.max_scheduled_requests_per_day || reservedCost > policy.limits.max_scheduled_spend_usd_per_day) return { ...summary, status: 'EXECUTION_BLOCKED_COST_POLICY', reserved_cost_usd: reservedCost };
  const raw = { run_id: runId, provider_id: 'vendor-openai', requested_model_id: target.api_model_id, surface_id: policy.surface_id, endpoint: 'responses', executed_at: stamp, commit_sha: commitSha, policy_id: policy.policy_id, reserved_cost_usd: reservedCost, requests: [], operational_errors: [] };
  const request = async (url, body) => {
    const serialized = body ? JSON.stringify(body) : null;
    if (serialized && Buffer.byteLength(serialized) > policy.execution.request_body_max_bytes) throw new Error('EXECUTION_BLOCKED_COST_POLICY');
    summary.provider_requests += 1;
    if (body) summary.inference_requests += 1;
    const response = await fetchImpl(url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: serialized } : {}) });
    const payload = await response.json().catch(() => ({}));
    raw.requests.push({ url, request: body ?? null, response_status: response.status, response: payload });
    if (!response.ok) { const error = new Error(`PROVIDER_HTTP_${response.status}`); error.status = response.status; throw error; }
    return payload;
  };
  try {
    const metadata = await request(`https://api.openai.com/v1/models/${encodeURIComponent(target.api_model_id)}`);
    if (metadata.id !== target.api_model_id) throw new Error('EXACT_MODEL_ID_MISMATCH');
    raw.returned_model_id = metadata.id;
    raw.methodology_version_ids = plans.map((plan) => target.probes.find((probe) => probe.probe_id === plan.probeId)?.methodology_version_id);
    raw.evaluator_versions = plans.map((plan) => target.probes.find((probe) => probe.probe_id === plan.probeId)?.evaluator_version);
    for (const plan of plans) {
      const outputs = [];
      let toolCalled = false;
      if (plan.revalidation) {
        const pair = revalidationRequests(target.api_model_id, policy.execution.max_output_tokens_per_request);
        const first = await request('https://api.openai.com/v1/responses', pair.first);
        const call = first.output?.find((item) => item.type === 'function_call' && item.name === 'read_authoritative_state');
        toolCalled = Boolean(call);
        if (!call) outputs.push({ revalidated: false, current_state: '' });
        else {
          const second = await request('https://api.openai.com/v1/responses', pair.second([call], call.call_id));
          outputs.push(JSON.parse(outputText(second)));
        }
      } else {
        for (const item of plan.requests) outputs.push(JSON.parse(outputText(await request('https://api.openai.com/v1/responses', item.body))));
      }
      const evaluation = plan.evaluate(outputs, toolCalled);
      const related = raw.requests.slice(-(plan.revalidation ? 2 : plan.requests.length));
      const usage = related.reduce((sum, item) => { const u = usageOf(item.response); return { input_tokens: sum.input_tokens + u.input_tokens, output_tokens: sum.output_tokens + u.output_tokens }; }, { input_tokens: 0, output_tokens: 0 });
      const cost = (usage.input_tokens * policy.execution.cost_preflight.input_usd_per_million_ceiling + usage.output_tokens * policy.execution.cost_preflight.output_usd_per_million_ceiling) / 1_000_000;
      summary.cost_usd += cost;
      summary.results.push({ schema_version: '1.0.0', id: `apiobs-${hash(`${runId}|${plan.probeId}`).slice(0, 24)}`, run_id: runId, model_id: target.model_id, vendor_id: target.vendor_id, api_model_id: target.api_model_id, returned_model_id: related.at(-1)?.response?.model ?? target.api_model_id, surface_id: policy.surface_id, probe_id: plan.probeId, methodology_version_id: target.probes.find((p) => p.probe_id === plan.probeId).methodology_version_id, evaluator_version: target.probes.find((p) => p.probe_id === plan.probeId).evaluator_version, executed_at: stamp, verified_on: stamp.slice(0, 10), status: evaluation.status, evidence_class_id: 'evidence-controlled-experiment', request_count: related.length, usage, estimated_cost_usd: Number(cost.toFixed(6)), machine_signals: evaluation.signals, limitations: [evaluation.limitation], raw_artifact: `${runId}/run.json`, originating_discovery_event_id: target.originating_discovery_event_id, commit_sha: commitSha, operational_error: null });
    }
    summary.status = 'COMPLETED';
  } catch (error) {
    const operationalError = { code: error.message, at: new Date().toISOString(), behavioral_failure: false };
    raw.operational_errors.push(operationalError);
    summary.status = error.message === 'EXECUTION_BLOCKED_COST_POLICY' ? error.message : 'OPERATIONAL_ERROR';
    if (summary.status === 'OPERATIONAL_ERROR') {
      summary.results = plans.map((plan) => ({ schema_version: '1.0.0', id: `apiobs-${hash(`${runId}|${plan.probeId}`).slice(0, 24)}`, run_id: runId, model_id: target.model_id, vendor_id: target.vendor_id, api_model_id: target.api_model_id, returned_model_id: raw.returned_model_id ?? target.api_model_id, surface_id: policy.surface_id, probe_id: plan.probeId, methodology_version_id: target.probes.find((p) => p.probe_id === plan.probeId).methodology_version_id, evaluator_version: target.probes.find((p) => p.probe_id === plan.probeId).evaluator_version, executed_at: stamp, verified_on: stamp.slice(0, 10), status: 'OPERATIONAL_ERROR', evidence_class_id: 'evidence-controlled-experiment', request_count: summary.inference_requests, usage: { input_tokens: 0, output_tokens: 0 }, estimated_cost_usd: 0, machine_signals: { behavioral_verdict: false }, limitations: ['Provider or transport failure; no behavioral conclusion is permitted.'], raw_artifact: `${runId}/run.json`, originating_discovery_event_id: target.originating_discovery_event_id, commit_sha: commitSha, operational_error: operationalError }));
    }
  }
  raw.normalized_evaluation = summary.results;
  const runDir = path.join(root, '.evaluation/runs', runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, 'run.json'), `${JSON.stringify(raw, null, 2)}\n`);
  if (summary.results.length) {
    await mkdir(path.join(root, 'data/model-evaluation'), { recursive: true });
    await appendFile(path.join(root, 'data/model-evaluation/results.jsonl'), `${summary.results.map(JSON.stringify).join('\n')}\n`);
  }
  summary.cost_usd = Number(summary.cost_usd.toFixed(6));
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}
