import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.env.GITHUB_ACTIONS !== 'true')
  throw new Error('GITHUB_ACTIONS_ONLY');
const root = fileURLToPath(new URL('../..', import.meta.url));
const current = JSON.parse(
  await readFile(
    path.join(root, 'data/model-evaluation/adoption.json'),
    'utf8',
  ),
);
const priorRead = spawnSync(
  'git',
  ['show', 'HEAD:data/model-evaluation/adoption.json'],
  { cwd: root, encoding: 'utf8' },
);
const prior =
  priorRead.status === 0 ? JSON.parse(priorRead.stdout) : { records: [] };
const priorRequired = new Set(
  prior.records
    .filter((record) => record.queue.state === 'TEST_REQUIRED')
    .map((record) => record.model_id),
);
const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const url = `https://api.github.com/repos/${owner}/${repo}/issues`;
const headers = {
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'X-GitHub-Api-Version': '2022-11-28',
};
const openResponse = await fetch(`${url}?state=open&per_page=100`, { headers });
if (!openResponse.ok)
  throw new Error(
    `Unable to inspect evaluation issues: ${openResponse.status}`,
  );
const openIssues = (await openResponse.json()).filter(
  (issue) => !issue.pull_request,
);
const alreadyNotified = new Set(
  openIssues.flatMap((issue) =>
    [
      ...(issue.body ?? '').matchAll(/<!-- etm-model-evaluation:([^>]+) -->/g),
    ].map((match) => match[1]),
  ),
);
const additions = current.records.filter(
  (record) =>
    record.queue.state === 'TEST_REQUIRED' &&
    !priorRequired.has(record.model_id) &&
    !alreadyNotified.has(record.model_id),
);
if (!additions.length) process.exit(0);

const body = [
  ...additions.map(
    (record) => `<!-- etm-model-evaluation:${record.model_id} -->`,
  ),
  'Official-source discovery found model evaluations that now require a person.',
  '',
  ...additions.map(
    (record) =>
      `- \`${record.model_id}\` (${record.api_model_id ?? 'API ID not established'})`,
  ),
  '',
  'No probe was run and no behavioral verdict was created.',
  `[Open the manual five-probe workflow](https://github.com/${owner}/${repo}/actions/workflows/evaluate-model.yml).`,
].join('\n');
const response = await fetch(url, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    title: `Evaluation required for ${additions.length} discovered model${additions.length === 1 ? '' : 's'}`,
    body,
    assignees: ['diegolinan'],
    labels: ['model-evaluation', 'review-required'],
  }),
});
if (!response.ok)
  throw new Error(
    `Unable to create evaluation issue: ${response.status} ${await response.text()}`,
  );
