import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readOfficial } from './fetch.mjs';
import * as openai from './adapters/openai.mjs';
import * as anthropic from './adapters/anthropic.mjs';
import * as google from './adapters/google.mjs';
import * as xai from './adapters/xai.mjs';
import {
  latestModels,
  normalizeDiscoveries,
  proposeEvents,
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
const catalog = (await read('data/catalog/models.json')).models;
const canonicalEvents = (
  await readFile(path.join(root, 'data/model-discovery/events.jsonl'), 'utf8')
)
  .split(/\r?\n/)
  .filter(Boolean)
  .map(JSON.parse);
let priorSourceChecks = [];
try {
  priorSourceChecks = (
    await readFile(path.join(root, 'data/model-discovery/source-checks.jsonl'), 'utf8')
  )
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const priorCheckByUrl = new Map();
for (const check of priorSourceChecks)
  if (check.content_sha256)
    priorCheckByUrl.set(`${check.source_id}|${check.url}`, check);
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
    source.type === 'research-feed' ? 'xml' : 'html';
  const relative = `${source.id}/${response.sha256}.${extension}.gz`;
  const destination = path.join(root, '.discovery/snapshots', relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, gzipSync(Buffer.from(response.body)));
  const normalizedPath = relative.replaceAll('\\', '/');
  const previous = priorCheckByUrl.get(`${source.id}|${response.url}`);
  const record = {
    schema_version: '1.0.0',
    id: `source-check-${createHash('sha256').update(`${source.id}|${response.url}|${response.fetched_at}|${response.sha256}`).digest('hex').slice(0, 24)}`,
    source_id: source.id,
    vendor_id: source.vendor_id,
    source_class: source.source_class,
    url: response.url,
    checked_at: response.fetched_at,
    result_status: 'OK',
    http_status: response.http_status,
    publication_date: null,
    etag: response.etag,
    last_modified: response.last_modified,
    content_sha256: response.sha256,
    previous_content_sha256: previous?.content_sha256 ?? null,
    meaningful_change:
      Boolean(previous?.content_sha256) && previous.content_sha256 !== response.sha256,
    entities_extracted: 0,
    normalized_identifiers: [],
    adapter: source.adapter,
    adapter_version: source.adapter_version,
    parser_version: source.parser_version,
    commit_sha: sourceCommit,
    workflow_run: process.env.GITHUB_RUN_ID ?? null,
    parser_error: null,
    raw_snapshot_path: normalizedPath,
  };
  sourceChecks.push(record);
  return { path: normalizedPath, record };
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
function failureCheck(source, url, status, checkedAt = new Date().toISOString()) {
  return {
    schema_version: '1.0.0',
    id: `source-check-${createHash('sha256').update(`${source.id}|${url}|${checkedAt}|${status}`).digest('hex').slice(0, 24)}`,
    source_id: source.id,
    vendor_id: source.vendor_id,
    source_class: source.source_class,
    url,
    checked_at: checkedAt,
    result_status: status,
    http_status: /^HTTP_(\d+)$/.test(status) ? Number(status.slice(5)) : null,
    publication_date: null,
    etag: null,
    last_modified: null,
    content_sha256: null,
    previous_content_sha256:
      priorCheckByUrl.get(`${source.id}|${url}`)?.content_sha256 ?? null,
    meaningful_change: false,
    entities_extracted: 0,
    normalized_identifiers: [],
    adapter: source.adapter,
    adapter_version: source.adapter_version,
    parser_version: source.parser_version,
    commit_sha: sourceCommit,
    workflow_run: process.env.GITHUB_RUN_ID ?? null,
    parser_error: status,
    raw_snapshot_path: null,
  };
}
if (config.enabled)
  for (const source of config.sources.filter((s) => s.enabled)) {
    const sourceFacts = [];
    try {
      if (source.type === 'official-model-index') {
        const response = await readOfficial(source.url, source, config);
        const indexSnapshot = await snapshot(source, response);
        response.snapshot_path = indexSnapshot.path;
        const adapter = adapters[source.adapter];
        if (!adapter) throw new Error('ADAPTER_NOT_REGISTERED');
        const discovered = adapter.index(response.body, source);
        if (!discovered.length) throw new Error('EMPTY_MODEL_INDEX');
        if (adapter.detail) {
          if (discovered.length > config.max_details_per_source)
            throw new Error('DETAIL_LIMIT_REQUIRES_REVIEW');
          // Bounded requests; individual page failures do not erase successful discoveries.
          for (const url of discovered) {
            let detailSnapshot = null;
            try {
              const detail = await readOfficial(url, source, config);
              detailSnapshot = await snapshot(source, detail);
              detail.snapshot_path = detailSnapshot.path;
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
              detailSnapshot.record.entities_extracted = model.api_model_id ? 1 : 0;
              detailSnapshot.record.normalized_identifiers = model.api_model_id
                ? [model.api_model_id]
                : [];
              detailSnapshot.record.publication_date = model.released_on ?? null;
            } catch (error) {
              const status = safeError(error);
              if (detailSnapshot) {
                detailSnapshot.record.result_status = status;
                detailSnapshot.record.parser_error = status;
              } else sourceChecks.push(failureCheck(source, url, status));
              outcomes.push({
                source_id: source.id,
                url,
                status,
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
        indexSnapshot.record.entities_extracted = sourceFacts.length;
        indexSnapshot.record.normalized_identifiers = [
          ...new Set(sourceFacts.map((model) => model.api_model_id).filter(Boolean)),
        ].sort((left, right) => left.localeCompare(right));
      } else {
        const response = await readOfficial(source.url, source, config);
        await snapshot(source, response);
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
      const status = safeError(error);
      sourceChecks.push(failureCheck(source, source.url, status));
      // A failed source never removes or mutates previously accepted models.
      outcomes.push({
        source_id: source.id,
        vendor_id: source.vendor_id,
        source_url: source.url,
        status,
      });
    }
  }
const models = normalizeDiscoveries(facts, previous, catalog, asOf);
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
  models,
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
