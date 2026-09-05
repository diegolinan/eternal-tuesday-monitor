import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { latestModels } from './discovery/lifecycle.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const catalogPath = path.join(root, 'data/catalog/models.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const events = (await readFile(path.join(root, 'data/model-discovery/events.jsonl'), 'utf8'))
  .split(/\r?\n/)
  .filter(Boolean)
  .map(JSON.parse);
const latest = new Map(latestModels(events).map((model) => [model.id, model]));

catalog.schema_version = '2.0.0';
catalog.models = catalog.models.map((entry) => {
  const eventModel = latest.get(entry.id);
  const named = entry.identity_status === 'named';
  return {
    id: entry.id,
    vendor_id: entry.vendor_id,
    name: entry.name,
    identity_status: entry.identity_status,
    catalog_status: eventModel
      ? 'ACCEPTED_DISCOVERY'
      : named
        ? 'MANUALLY_CURATED'
        : 'REFERENCE_ONLY',
    api_model_id: eventModel?.api_model_id ?? entry.api_model_id ?? null,
    aliases: eventModel?.aliases ?? entry.aliases ?? [],
    release_state: eventModel?.release_state ?? entry.release_state ?? 'UNKNOWN',
    relevance_state: entry.relevance_state ?? 'UNCLASSIFIED',
    relevance_review: entry.relevance_review ?? null,
    supersedes_model_id:
      entry.supersession_review?.status === 'REVIEWED_ACCEPTED'
        ? entry.supersedes_model_id
        : null,
    supersession_review: entry.supersession_review ?? null,
    discovery_provenance:
      eventModel?.provenance ?? entry.discovery_provenance ?? [],
  };
});

await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Synchronized ${catalog.models.length} canonical model records.`);
