import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { supersessionEvents } from './lifecycle.mjs';
import { allowedUrl } from './fetch.mjs';
import { catalogEntryForDecision } from './decision.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const modeIndex = process.argv.indexOf('--mode');
const mode = modeIndex < 0 ? 'review' : process.argv[modeIndex + 1];
if (!['automatic', 'review'].includes(mode))
  throw new Error('Use --mode automatic or --mode review');
const branch = spawnSync('git', ['branch', '--show-current'], {
  cwd: root,
  encoding: 'utf8',
}).stdout.trim();
if (branch === 'main' && process.env.GITHUB_ACTIONS !== 'true')
  throw new Error(
    'Stage external changes on GitHub Actions or a proposal branch.',
  );

const read = (file) => readFile(path.join(root, file), 'utf8');
const json = async (file) => JSON.parse(await read(file));
const report = await json('.discovery/run.json');
const config = await json('config/model-discovery.json');
const policy = await json('config/probe-execution-policy.json');
const relevancePolicy = await json('config/model-relevance-policy.json');
const catalog = await json('data/catalog/models.json');
const ledgerPath = 'data/model-discovery/events.jsonl';
const raw = await read(ledgerPath);
const prior = raw.split(/\r?\n/).filter(Boolean).map(JSON.parse);
const wanted = mode === 'automatic' ? 'AUTO_ACCEPT' : 'REVIEW_REQUIRED';
const selected = report.decisions.filter((item) => item.decision === wanted);
const additions = selected.filter(
  ({ event }) => !prior.some((old) => old.id === event.id),
);

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(
  await json('schemas/model-discovery-event.schema.json'),
);
const validateSourceCheck = ajv.compile(await json('schemas/source-check.schema.json'));
for (const { event } of additions) {
  if (!validate(event)) throw new Error(ajv.errorsText(validate.errors));
  for (const provenance of event.model.provenance) {
    const source = config.sources.find(
      (item) =>
        item.id === provenance.source_id &&
        item.vendor_id === event.model.vendor_id,
    );
    if (!source) throw new Error('Unknown provenance source');
    allowedUrl(provenance.url, source);
  }
}

if (mode === 'automatic') {
  const checkPath = 'data/model-discovery/source-checks.jsonl';
  const checkRaw = await read(checkPath);
  const priorChecks = checkRaw.split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const priorCheckIds = new Set(priorChecks.map((check) => check.id));
  const newChecks = report.source_checks.filter((check) => !priorCheckIds.has(check.id));
  for (const check of newChecks)
    if (!validateSourceCheck(check))
      throw new Error(ajv.errorsText(validateSourceCheck.errors));
  if (newChecks.length)
    await writeFile(
      path.join(root, checkPath),
      checkRaw.trimEnd() + (priorChecks.length ? '\n' : '') + newChecks.map((check) => JSON.stringify(check)).join('\n') + '\n',
    );
}

for (const decision of additions) {
  const model = decision.event.model;
  const existing = catalog.models.find((item) => item.id === model.id);
  if (!existing) {
    catalog.models.push(
      catalogEntryForDecision(
        decision,
        report.evaluated_on,
        relevancePolicy.policy_id,
      ),
    );
  } else {
    existing.name = model.display_name;
    existing.catalog_status = 'ACCEPTED_DISCOVERY';
    existing.api_model_id = model.api_model_id;
    existing.aliases = model.aliases;
    existing.release_state = model.release_state;
    existing.discovery_provenance = model.provenance;
  }
}

const publicIdentitySources = new Set(
  config.sources
    .filter((source) => source.enabled && source.type === 'official-model-index')
    .map((source) => source.id),
);
const catalogCountBefore = catalog.models.length;
if (mode === 'automatic')
  catalog.models = catalog.models.filter(
    (model) =>
      model.catalog_status !== 'ACCEPTED_DISCOVERY' ||
      (model.discovery_provenance ?? []).some((item) =>
        publicIdentitySources.has(item.source_id),
      ),
  );
const catalogChanged = catalog.models.length !== catalogCountBefore || additions.length > 0;

if (catalogChanged) {
  catalog.models.sort((left, right) => left.id.localeCompare(right.id));
  await writeFile(
    path.join(root, 'data/catalog/models.json'),
    `${JSON.stringify(catalog, null, 2)}\n`,
  );
  if (additions.length)
    await writeFile(
      path.join(root, ledgerPath),
      raw.trimEnd() +
        (prior.length ? '\n' : '') +
        additions.map(({ event }) => JSON.stringify(event)).join('\n') +
        '\n',
    );
  const statePath = 'data/state-events/events.jsonl';
  const stateRaw = await read(statePath);
  const existingStates = stateRaw
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse);
  const states = supersessionEvents(
    additions.map(({ event }) => event.model),
    catalog.models,
    policy,
    report.evaluated_on,
  ).filter(
    (event) => !existingStates.some((existing) => existing.id === event.id),
  );
  if (states.length)
    await writeFile(
      path.join(root, statePath),
      stateRaw.trimEnd() +
        (existingStates.length ? '\n' : '') +
        states.map((event) => JSON.stringify(event)).join('\n') +
        '\n',
    );
}

const escape = (value) =>
  String(value ?? 'UNKNOWN')
    .replaceAll('@', '＠')
    .replace(/[<>|`[\]\\]/g, '')
    .replace(/[\r\n]/g, ' ');
const rows = additions.map(({ event, decision, relevance, reasons }) => {
  const model = event.model;
  return `| ${escape(model.display_name)} | ${escape(model.vendor_id)} | ${escape(model.api_model_id)} | ${escape(event.type)} | ${escape(decision)} | ${escape(relevance.state)} | ${escape(reasons.join(', ') || 'None')} |`;
});
const summary = [
  '# Official model discovery V1',
  '',
  `Mode: ${mode}. ${additions.length} new ledger event(s) selected.`,
  'Discovery records catalog metadata only. No inference, PASS/FAIL, observation or consumer-product mapping is created.',
  '',
  '| Model | Vendor | API ID | Change | Decision | Relevance | Review reasons |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...(rows.length ? rows : ['| None | — | — | — | — | — | — |']),
  '',
  '## Source outcomes',
  ...report.outcomes.map(
    (outcome) =>
      `- ${escape(outcome.source_id)}: ${escape(outcome.status)}${outcome.models == null ? '' : ` (${outcome.models} normalized identities)`}${outcome.url ? ` — ${escape(outcome.url)}` : ''}`,
  ),
  `- Raw source checks preserved: ${report.source_checks.length}`,
  '- Provider inference and probe-target generation are outside this workflow.',
].join('\n');
await writeFile(
  path.join(root, `.discovery/${mode}-summary.md`),
  `${summary}\n`,
);
if (mode === 'review')
  await writeFile(
    path.join(root, '.discovery/pr-body.md'),
    `${summary}\n\nMerging this proposal is the human acceptance step. Relationship and product-surface claims remain unset unless explicitly reviewed in the diff.\n`,
  );

console.log(
  `Prepared ${additions.length} ${mode} catalog event(s); provider inference is not part of discovery.`,
);
