import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { probePlans, revalidationRequests } from './probes.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const outputText = (response) => response.output_text ?? response.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
const usageOf = (response) => ({ input_tokens: response.usage?.input_tokens ?? 0, output_tokens: response.usage?.output_tokens ?? 0 });

export async function runManualEvaluation({ root, modelId, apiModelId, acceptedSpendUsd, fetchImpl = fetch, now = new Date(), commitSha = process.env.GITHUB_SHA, apiKey = process.env.OPENAI_API_KEY }) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('GITHUB_ACTIONS_ONLY');
  if (!apiKey) throw new Error('OPENAI_API_KEY_NOT_CONFIGURED');
  if (!Number.isFinite(acceptedSpendUsd) || acceptedSpendUsd <= 0) throw new Error('INVALID_COST_AUTHORIZATION');
  const policy = await json(path.join(root, 'config/manual-evaluation-policy.json'));
  if (acceptedSpendUsd > policy.max_accepted_spend_usd) throw new Error('COST_AUTHORIZATION_EXCEEDS_POLICY');
  const catalog = await json(path.join(root, 'data/catalog/models.json'));
  const model = catalog.models.find((item) => item.id === modelId);
  if (!model || model.vendor_id !== 'vendor-openai') throw new Error('UNSUPPORTED_OR_UNKNOWN_MODEL');
  if (!apiModelId || model.api_model_id !== apiModelId) throw new Error('EXACT_API_MODEL_ID_MISMATCH');
  const plans = probePlans(apiModelId, policy.max_output_tokens_per_request);
  const inferenceCount = plans.reduce((count, plan) => count + (plan.revalidation ? 2 : plan.requests.length), 0);
  const reservedCost = inferenceCount * ((policy.assumed_input_tokens_per_request * policy.input_usd_per_million_ceiling + policy.max_output_tokens_per_request * policy.output_usd_per_million_ceiling) / 1_000_000);
  if (inferenceCount > policy.max_inference_requests || inferenceCount + 1 > policy.max_provider_requests || reservedCost > acceptedSpendUsd) throw new Error('EXECUTION_BLOCKED_COST_POLICY');

  const stamp = now.toISOString();
  const runId = `manual-eval-${hash(`${stamp}|${modelId}|${commitSha}`).slice(0, 20)}`;
  const raw = { run_id: runId, provider_id: 'vendor-openai', requested_model_id: apiModelId, surface_id: policy.surface_id, endpoint: policy.endpoint, executed_at: stamp, commit_sha: commitSha, policy_id: policy.policy_id, reserved_cost_usd: Number(reservedCost.toFixed(6)), requests: [], operational_errors: [] };
  let providerRequests = 0;
  let inferenceRequests = 0;
  const request = async (url, requestBody) => {
    providerRequests += 1;
    if (requestBody) inferenceRequests += 1;
    const response = await fetchImpl(url, { method: requestBody ? 'POST' : 'GET', headers: { Authorization: `Bearer ${apiKey}`, ...(requestBody ? { 'Content-Type': 'application/json' } : {}) }, ...(requestBody ? { body: JSON.stringify(requestBody) } : {}) });
    const payload = await response.json().catch(() => ({}));
    raw.requests.push({ url, request: requestBody ?? null, response_status: response.status, response: payload });
    if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
    return payload;
  };

  const results = [];
  try {
    const metadata = await request(`https://api.openai.com/v1/models/${encodeURIComponent(apiModelId)}`);
    if (metadata.id !== apiModelId) throw new Error('EXACT_MODEL_ID_MISMATCH');
    for (const plan of plans) {
      const outputs = [];
      let toolCalled = false;
      const start = raw.requests.length;
      if (plan.revalidation) {
        const pair = revalidationRequests(apiModelId, policy.max_output_tokens_per_request);
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
      const evaluated = plan.evaluate(outputs, toolCalled);
      const related = raw.requests.slice(start);
      const usage = related.reduce((sum, item) => { const used = usageOf(item.response); return { input_tokens: sum.input_tokens + used.input_tokens, output_tokens: sum.output_tokens + used.output_tokens }; }, { input_tokens: 0, output_tokens: 0 });
      const estimatedCost = (usage.input_tokens * policy.input_usd_per_million_ceiling + usage.output_tokens * policy.output_usd_per_million_ceiling) / 1_000_000;
      results.push({ schema_version: '1.0.0', id: `apiobs-${hash(`${runId}|${plan.probeId}`).slice(0, 24)}`, run_id: runId, model_id: modelId, vendor_id: model.vendor_id, api_model_id: apiModelId, returned_model_id: related.at(-1)?.response?.model ?? apiModelId, surface_id: policy.surface_id, probe_id: plan.probeId, methodology_version_id: plan.methodology, evaluator_version: 'manual-api-evaluator-1', executed_at: stamp, verified_on: stamp.slice(0, 10), status: evaluated.status, evidence_class_id: 'evidence-controlled-experiment', request_count: related.length, usage, estimated_cost_usd: Number(estimatedCost.toFixed(6)), machine_signals: evaluated.signals, limitations: [evaluated.limitation, 'This result applies only to the named provider API and exact returned model; it does not describe ChatGPT, Codex, or another consumer surface.'], raw_artifact: `${runId}/run.json`, originating_discovery_event_id: null, commit_sha: commitSha, operational_error: null });
    }
  } catch (error) {
    const operational = { code: error.message, at: new Date().toISOString(), behavioral_failure: false };
    raw.operational_errors.push(operational);
    results.splice(0, results.length, ...plans.map((plan) => ({ schema_version: '1.0.0', id: `apiobs-${hash(`${runId}|${plan.probeId}`).slice(0, 24)}`, run_id: runId, model_id: modelId, vendor_id: model.vendor_id, api_model_id: apiModelId, returned_model_id: apiModelId, surface_id: policy.surface_id, probe_id: plan.probeId, methodology_version_id: plan.methodology, evaluator_version: 'manual-api-evaluator-1', executed_at: stamp, verified_on: stamp.slice(0, 10), status: 'OPERATIONAL_ERROR', evidence_class_id: 'evidence-controlled-experiment', request_count: inferenceRequests, usage: { input_tokens: 0, output_tokens: 0 }, estimated_cost_usd: 0, machine_signals: { behavioral_verdict: false }, limitations: ['Provider, credential, parsing, or transport failure; this is not a behavioral FAIL.'], raw_artifact: `${runId}/run.json`, originating_discovery_event_id: null, commit_sha: commitSha, operational_error: operational })));
  }

  raw.normalized_evaluation = results;
  const runDir = path.join(root, '.evaluation/runs', runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, 'run.json'), `${JSON.stringify(raw, null, 2)}\n`);
  await appendFile(path.join(root, 'data/model-evaluation/results.jsonl'), `${results.map(JSON.stringify).join('\n')}\n`);
  const counts = results.reduce((acc, result) => ({ ...acc, [result.status]: (acc[result.status] ?? 0) + 1 }), {});
  const changelog = { schema_version: '1.0.0', id: `change-${runId}`, recorded_on: stamp.slice(0, 10), type: 'PROBE_RESULT_RECORDED', title: `Five-probe API evaluation recorded for ${model.name}`, summary: `Scoped OpenAI API result: ${Object.entries(counts).map(([key, count]) => `${count} ${key}`).join(', ')}. No consumer-product behavior was inferred.`, source: 'HUMAN_REVIEW', subjects: [{ type: 'model', id: modelId, label: model.name }], source_urls: [], pull_request_url: null, affects_observations: false };
  await appendFile(path.join(root, 'data/changelog/events.jsonl'), `${JSON.stringify(changelog)}\n`);
  const summary = { run_id: runId, model_id: modelId, api_model_id: apiModelId, provider_requests: providerRequests, inference_requests: inferenceRequests, reserved_cost_usd: Number(reservedCost.toFixed(6)), result_counts: counts, results };
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(path.join(root, '.evaluation/latest-summary.md'), `# Manual five-probe evaluation\n\n- Model: ${model.name} (\`${apiModelId}\`)\n- Surface: OpenAI API only\n- Results: ${Object.entries(counts).map(([key, count]) => `${count} ${key}`).join(', ')}\n- Provider requests: ${providerRequests}\n- Conservative reserved estimate: $${reservedCost.toFixed(6)}\n\nMerging the generated PR is the required human acceptance step. No result applies to ChatGPT, Codex, or another consumer surface.\n`);
  return summary;
}
