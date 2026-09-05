import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { evaluateRelevance } from './discovery/decision.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const argument = process.argv.indexOf('--as-of');
const asOf = argument < 0 ? null : process.argv[argument + 1];
if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf))
  throw new Error('models:relevance:sync requires --as-of YYYY-MM-DD');
const catalogPath = path.join(root, 'data/catalog/models.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const policy = JSON.parse(
  await readFile(path.join(root, 'config/model-relevance-policy.json'), 'utf8'),
);
let changed = 0;
for (const model of catalog.models) {
  if (
    model.catalog_status !== 'ACCEPTED_DISCOVERY' ||
    model.relevance_state !== 'UNCLASSIFIED'
  )
    continue;
  const relevance = evaluateRelevance(
    {
      vendor_id: model.vendor_id,
      api_model_id: model.api_model_id,
    },
    policy,
  );
  model.relevance_state = relevance.state;
  model.relevance_review = {
    status:
      relevance.state === 'REVIEW_REQUIRED'
        ? 'REVIEW_REQUIRED'
        : 'POLICY_CLASSIFIED',
    reviewed_on: asOf,
    reason: relevance.reason,
    policy_id: policy.policy_id,
    rule_id: relevance.ruleId,
  };
  changed++;
}
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Classified relevance for ${changed} accepted discovery records.`);
