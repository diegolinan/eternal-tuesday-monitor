import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
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
import {
  classifyDiscoveryEvents,
  evaluateRelevance,
} from './decision.mjs';

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
const relevancePolicy = await read('config/model-relevance-policy.json');
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
const sourceChecks = [];
const sourceCommit = (() => {
  const candidate = process.env.GITHUB_SHA;
  if (/^[a-f0-9]{40}$/.test(candidate ?? '')) return candidate;
  return spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).stdout.trim();
})();
async function snapshot(source, response) {
  const extension =
    source.type === 'authenticated-model-list' ? 'json' : 'html';
  const relative = `${source.id}/${response.sha256}.${extension}.gz`;
  const destination = path.join(root, '.discovery/snapshots', relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, gzipSync(Buffer.from(response.body)));
  const normalizedPath = relative.replaceAll('\\', '/');
  sourceChecks.push({
    source_id: source.id,
    vendor_id: source.vendor_id,
    url: response.url,
    fetched_at: response.fetched_at,
    etag: response.etag,
    last_modified: response.last_modified,
    sha256: response.sha256,
    adapter: source.adapter,
    adapter_version: source.adapter_version,
    parser_version: source.parser_version,
    checked_from_commit: sourceCommit,
    raw_snapshot_path: normalizedPath,
  });
  return normalizedPath;
}
function provenance(source, response) {
  return {
    source_id: source.id,
    url: response.url,
    checked_on: asOf,
    sha256: response.sha256,
    fetched_at: response.fetched_at,
    etag: response.etag,
    last_modified: response.last_modified,
    adapter: source.adapter,
    adapter_version: source.adapter_version,
    parser_version: source.parser_version,
    checked_from_commit: sourceCommit,
    raw_snapshot_artifact: 'official-model-discovery-sources',
    raw_snapshot_path: response.snapshot_path,
    raw_snapshot_retention_days: 90,
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
          response.snapshot_path = await snapshot(source, response);
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
        response.snapshot_path = await snapshot(source, response);
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
              detail.snapshot_path = await snapshot(source, detail);
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
        vendor_id: source.vendor_id,
        source_url: source.url,
        status: 'OK',
        models: sourceFacts.length,
      });
    } catch (error) {
      // Discard incomplete paginated listings. Missing credentials are not non-existence.
      outcomes.push({
        source_id: source.id,
        vendor_id: source.vendor_id,
        source_url: source.url,
        status: safeError(error),
      });
    }
  }
const models = applyAvailabilityFailures(
  normalizeDiscoveries(facts, previous, catalog, asOf),
  previous,
  outcomes,
  config.sources,
  asOf,
);
const proposed = proposeEvents(models, previous, asOf);
const pendingDecisions = pendingEvents.map((event) => ({
  event,
  decision: 'REVIEW_REQUIRED',
  changeType: event.type,
  relevance: evaluateRelevance(event.model, relevancePolicy),
  reasons: ['PENDING_REVIEW_BRANCH'],
}));
const decisions = [
  ...pendingDecisions,
  ...classifyDiscoveryEvents(
  proposed,
  previous,
  config.sources,
  relevancePolicy,
  catalog,
  ),
];
const events = [...pendingEvents, ...proposed];
const report = {
  schema_version: '1.0.0',
  evaluated_on: asOf,
  outcomes,
  source_checks: sourceChecks,
  events,
  decisions,
  models: models.map((m) => ({
    ...m,
    eligibility: eligibility(m, policy, asOf),
  })),
  execution: 'DISABLED_NO_INFERENCE_REQUESTS',
  review_required: decisions.some(
    (item) => item.decision === 'REVIEW_REQUIRED',
  ),
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
      automatic_acceptance: decisions.filter(
        (item) => item.decision === 'AUTO_ACCEPT',
      ).length,
      review_required: decisions.filter(
        (item) => item.decision === 'REVIEW_REQUIRED',
      ).length,
      execution: report.execution,
    },
    null,
    2,
  ),
);
