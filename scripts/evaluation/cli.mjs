import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { latestModels } from '../discovery/lifecycle.mjs';
import { buildAdoptionRegister } from './adoption.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
};
const asOf = option('--as-of') ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error('INVALID_AS_OF');
const readJson = async (relative) =>
  JSON.parse(await readFile(path.join(root, relative), 'utf8'));
const readLines = async (relative) =>
  (await readFile(path.join(root, relative), 'utf8'))
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse);
const reportPath = option('--report');
let report = { outcomes: [], models: [] };
if (reportPath) report = await readJson(reportPath);
const events = await readLines('data/model-discovery/events.jsonl');
const canonical = latestModels(events);
const liveById = new Map(report.models.map((model) => [model.id, model]));
const models = canonical.map((model) => liveById.get(model.id) ?? model);
const policy = await readJson('config/model-evaluation-policy.json');
const catalog = (await readJson('data/catalog/models.json')).models;
const probes = (await readJson('data/catalog/probes.json')).probes;
const observations = await readLines('data/observations/observations.jsonl');
let evaluationResults = [];
try {
  evaluationResults = await readLines('data/model-evaluation/results.jsonl');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const sourceConfig = (await readJson('config/model-discovery.json')).sources;
let previous = { records: [] };
try {
  previous = await readJson('data/model-evaluation/adoption.json');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const adoption = buildAdoptionRegister({
  models,
  events,
  catalog,
  policy,
  probes,
  observations,
  evaluationResults,
  sourceOutcomes: report.outcomes,
  sourceConfig,
  asOf,
  previous,
});
await mkdir(path.join(root, 'data/model-evaluation'), { recursive: true });
await writeFile(
  path.join(root, 'data/model-evaluation/adoption.json'),
  `${JSON.stringify(adoption, null, 2)}\n`,
);
const targets = adoption.records.flatMap((record) =>
  record.probes
    .filter((probe) => probe.state === 'ELIGIBLE')
    .map((probe) => ({
      model_id: record.model_id,
      api_model_id: record.api_model_id,
      probe_id: probe.probe_id,
      methodology_version_id: probe.methodology_version_id,
      endpoint: probe.endpoint,
      execution_authorized: record.queue.execution_authorized,
    })),
);
await mkdir(path.join(root, '.evaluation'), { recursive: true });
await writeFile(
  path.join(root, '.evaluation/queue.json'),
  `${JSON.stringify(
    {
      evaluated_on: asOf,
      policy_id: policy.policy_id,
      execution_enabled: policy.execution_enabled,
      scheduled_request_budget: policy.limits.max_scheduled_requests_per_day,
      scheduled_spend_budget_usd: policy.limits.max_scheduled_spend_usd_per_day,
      targets,
    },
    null,
    2,
  )}\n`,
);
console.log(
  JSON.stringify(
    {
      evaluated_on: asOf,
      relevant_models: adoption.records.length,
      api_available: adoption.records.filter(
        (item) => item.api_availability.state === 'AVAILABLE',
      ).length,
      auth_required: adoption.records.filter(
        (item) => item.api_availability.state === 'AUTH_REQUIRED_TO_VERIFY',
      ).length,
      eligible_probe_targets: targets.length,
      authorized_probe_targets: targets.filter(
        (item) => item.execution_authorized,
      ).length,
      paid_inference: policy.execution_enabled ? 'POLICY_GATED' : 'DISABLED',
    },
    null,
    2,
  ),
);
