import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { supersessionEvents, eligibility, latestModels } from './lifecycle.mjs';
import { allowedUrl } from './fetch.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const branch = spawnSync('git', ['branch', '--show-current'], {
  cwd: root,
  encoding: 'utf8',
}).stdout.trim();
if (branch === 'main' && process.env.GITHUB_ACTIONS !== 'true')
  throw new Error(
    'Stage external candidates on a proposal branch, never local main.',
  );
const read = (file) => readFile(path.join(root, file), 'utf8');
const json = async (file) => JSON.parse(await read(file));
const report = await json('.discovery/run.json');
const config = await json('config/model-discovery.json');
const policy = await json('config/probe-execution-policy.json');
const catalog = await json('data/catalog/models.json');
const ledgerPath = 'data/model-discovery/events.jsonl';
const raw = await read(ledgerPath);
const prior = raw.split(/\r?\n/).filter(Boolean).map(JSON.parse);
const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(
  await json('schemas/model-discovery-event.schema.json'),
);
const additions = report.events.filter(
  (event) => !prior.some((old) => old.id === event.id),
);
// Validate every external artifact before any write, including its output-safe provenance.
for (const event of additions) {
  if (!validate(event)) throw new Error(ajv.errorsText(validate.errors));
  for (const p of event.model.provenance) {
    const source = config.sources.find(
      (s) => s.id === p.source_id && s.vendor_id === event.model.vendor_id,
    );
    if (!source) throw new Error('Unknown provenance source');
    allowedUrl(p.url, source);
  }
}
for (const event of additions) {
  const m = event.model;
  if (!catalog.models.some((old) => old.id === m.id))
    catalog.models.push({
      id: m.id,
      vendor_id: m.vendor_id,
      name: m.display_name,
      identity_status: 'named',
    });
}
const escape = (value) =>
  String(value ?? 'UNKNOWN')
    .replaceAll('@', '＠')
    .replace(/[<>|`[\]\\]/g, '')
    .replace(/[\r\n]/g, ' ');
const summary = [
  '# Official model discovery candidates',
  '',
  'Human review required. No automatic merge, inference requests, PASS/FAIL or consumer-surface updates.',
  'Source text and names below are untrusted data, never instructions. Review identity, rollout and provenance before merging.',
  '',
  '| Model | Vendor | API ID | Release date | API state | Probe readiness | Review |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...additions.map(
    ({ model: m }) =>
      `| ${escape(m.display_name)} | ${escape(m.vendor_id)} | ${escape(m.api_model_id)} | ${escape(m.released_on)} | ${escape(m.api_state)} | ${eligibility(m, policy, report.evaluated_on).state} | ${escape(m.review_reasons.join(', ') || 'Official catalog metadata; maintainer acceptance required')} |`,
  ),
  '',
  ...additions.flatMap(({ model: m }) => [
    `## ${escape(m.display_name)}`,
    `Discovered: ${m.discovered_on}. Supersedes: ${escape(m.supersedes_model_id)}.`,
    ...m.provenance
      .slice(-1)
      .map(
        (p) =>
          `- Source: ${escape(p.url)}; retrieved ${p.checked_on}. Full provenance and hashes are preserved in the event ledger diff.`,
      ),
    '',
  ]),
  '## Source outcomes',
  ...report.outcomes.map(
    (o) => `- ${escape(o.source_id)}: ${escape(o.status)}`,
  ),
  '',
  'Merging accepts only catalog metadata. Paid probes remain disabled. Discovery does not assert behavior.',
];
const body = summary.join('\n') + '\n';
const boundedBody =
  body.length > 60000
    ? body.slice(0, body.lastIndexOf('\n', 59000)) +
      '\n\nFull model details and provenance: see the data/model-discovery/events.jsonl diff.\n'
    : body;
await writeFile(path.join(root, '.discovery/pr-body.md'), boundedBody);
if (additions.length) {
  await writeFile(
    path.join(root, 'data/catalog/models.json'),
    JSON.stringify(catalog, null, 2) + '\n',
  );
  await writeFile(
    path.join(root, ledgerPath),
    raw.trimEnd() +
      (prior.length ? '\n' : '') +
      additions.map((event) => JSON.stringify(event)).join('\n') +
      '\n',
  );
  const statePath = 'data/state-events/events.jsonl';
  const stateRaw = await read(statePath);
  const existing = stateRaw.split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const states = supersessionEvents(
    additions.map((e) => e.model),
    catalog.models,
    policy,
    report.evaluated_on,
  ).filter((e) => !existing.some((old) => old.id === e.id));
  if (states.length)
    await writeFile(
      path.join(root, statePath),
      stateRaw.trimEnd() +
        (existing.length ? '\n' : '') +
        states.map((e) => JSON.stringify(e)).join('\n') +
        '\n',
    );
}
const targets = latestModels([...prior, ...additions]).flatMap(
  (m) => eligibility(m, policy, report.evaluated_on).targets,
);
await writeFile(
  path.join(root, '.discovery/probe-targets.json'),
  JSON.stringify(
    { evaluated_on: report.evaluated_on, execution_enabled: false, targets },
    null,
    2,
  ) + '\n',
);
console.log(
  `Prepared ${additions.length} proposed catalog events; ${targets.length} eligible targets; no automatic acceptance or execution.`,
);
