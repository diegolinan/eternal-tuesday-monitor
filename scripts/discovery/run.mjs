import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readOfficial } from './fetch.mjs';
import * as openai from './adapters/openai.mjs';
import * as anthropic from './adapters/anthropic.mjs';
import * as google from './adapters/google.mjs';
import * as xai from './adapters/xai.mjs';
import { parseListing } from './adapters/api.mjs';
import {
  latestModels,
  normalizeDiscoveries,
  proposeEvents,
  eligibility,
  applyAvailabilityFailures,
} from './lifecycle.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = async (file) =>
  JSON.parse(await readFile(path.join(root, file), 'utf8'));
const index = process.argv.indexOf('--as-of');
const asOf =
  index < 0 ? new Date().toISOString().slice(0, 10) : process.argv[index + 1];
if (
  !/^\d{4}-\d{2}-\d{2}$/.test(asOf ?? '') ||
  new Date(`${asOf}T00:00:00Z`).toISOString().slice(0, 10) !== asOf
)
  throw new Error('Invalid --as-of date');
const config = await read('config/model-discovery.json');
const policy = await read('config/probe-execution-policy.json');
const catalog = (await read('data/catalog/models.json')).models;
const canonicalEvents = (
  await readFile(path.join(root, 'data/model-discovery/events.jsonl'), 'utf8')
)
  .split(/\r?\n/)
  .filter(Boolean)
  .map(JSON.parse);
let pendingEvents = [];
try {
  pendingEvents = (
    await readFile(path.join(root, '.discovery/pending-events.jsonl'), 'utf8')
  )
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const priorIds = new Set(canonicalEvents.map((e) => e.id));
pendingEvents = pendingEvents.filter((e) => !priorIds.has(e.id));
const previous = latestModels([...canonicalEvents, ...pendingEvents]);
const adapters = {
  'openai-docs': openai,
  'anthropic-docs': anthropic,
  'google-docs': google,
  'xai-docs': xai,
};
const facts = [];
const outcomes = [];
function provenance(source, response) {
  return {
    source_id: source.id,
    url: response.url,
    checked_on: asOf,
    sha256: response.sha256,
    parser_version: source.parser_version,
  };
}
const safeError = (error) =>
  /^(?:[A-Z][A-Z0-9_]+)$/.test(error.message) ? error.message : 'ADAPTER_ERROR';
if (config.enabled)
  for (const source of config.sources.filter((s) => s.enabled)) {
    const sourceFacts = [];
    try {
      if (source.type === 'authenticated-model-list') {
        let next = source.url;
        const seen = new Set();
        let pages = 0;
        while (next) {
          if (++pages > config.max_pages_per_source || seen.has(next))
            throw new Error('PAGINATION_LIMIT');
          seen.add(next);
          const response = await readOfficial(next, source, config);
          const parsed = parseListing(response.body, source);
          sourceFacts.push(
            ...parsed.models.map((m) => ({
              ...m,
              provenance: [provenance(source, response)],
            })),
          );
          next = parsed.next;
        }
      } else {
        const response = await readOfficial(source.url, source, config);
        const adapter = adapters[source.adapter];
        if (!adapter) throw new Error('ADAPTER_NOT_REGISTERED');
        const discovered = adapter.index(response.body, source);
        if (!discovered.length) throw new Error('EMPTY_MODEL_INDEX');
        if (adapter.detail) {
          if (discovered.length > config.max_details_per_source)
            throw new Error('DETAIL_LIMIT_REQUIRES_REVIEW');
          // Bounded requests; individual page failures do not erase successful discoveries.
          for (const url of discovered) {
            try {
              const detail = await readOfficial(url, source, config);
              const model = adapter.detail(detail.body, source, detail.url);
              if (
                model.api_model_id &&
                !new RegExp(source.id_pattern).test(model.api_model_id)
              )
                continue;
              sourceFacts.push({
                ...model,
                provenance: [
                  provenance(source, response),
                  provenance(source, detail),
                ],
              });
            } catch (error) {
              outcomes.push({
                source_id: source.id,
                url,
                status: safeError(error),
              });
            }
          }
        } else
          sourceFacts.push(
            ...discovered.map((m) => ({
              ...m,
              provenance: [provenance(source, response)],
            })),
          );
      }
      facts.push(...sourceFacts);
      outcomes.push({
        source_id: source.id,
        status: 'OK',
        models: sourceFacts.length,
      });
    } catch (error) {
      // Discard incomplete paginated listings. Missing credentials are not non-existence.
      outcomes.push({ source_id: source.id, status: safeError(error) });
    }
  }
const models = applyAvailabilityFailures(
  normalizeDiscoveries(facts, previous, catalog, asOf),
  previous,
  outcomes,
  config.sources,
  asOf,
);
const events = [...pendingEvents, ...proposeEvents(models, previous, asOf)];
const report = {
  schema_version: '1.0.0',
  evaluated_on: asOf,
  outcomes,
  events,
  models: models.map((m) => ({
    ...m,
    eligibility: eligibility(m, policy, asOf),
  })),
  execution: 'DISABLED_NO_INFERENCE_REQUESTS',
  review_required: true,
};
await mkdir(path.join(root, '.discovery'), { recursive: true });
await writeFile(
  path.join(root, '.discovery/run.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    {
      evaluated_on: asOf,
      outcomes,
      discovered: models.length,
      changes: events.length,
      execution: report.execution,
    },
    null,
    2,
  ),
);
