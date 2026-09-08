import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  buildEvidenceReviewIssue,
  collectEvidenceReviewsDue,
  readEvidenceReviewMarker,
} from './evidence-review-due.mjs';

if (process.env.GITHUB_ACTIONS !== 'true')
  throw new Error('GITHUB_ACTIONS_ONLY');
if (!process.env.GITHUB_REPOSITORY || !process.env.GITHUB_TOKEN)
  throw new Error('GITHUB_CONTEXT_REQUIRED');

const root = fileURLToPath(new URL('../..', import.meta.url));
const monitor = JSON.parse(
  await readFile(path.join(root, 'public/data/monitor.json'), 'utf8'),
);
const due = collectEvidenceReviewsDue(monitor);
const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const apiRoot = `https://api.github.com/repos/${owner}/${repo}`;
const title = '[Evidence review due] Retest-required observations';
const headers = {
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'X-GitHub-Api-Version': '2022-11-28',
};

const response = await fetch(`${apiRoot}/issues?state=open&per_page=100`, {
  headers,
});
if (!response.ok)
  throw new Error(
    `Unable to inspect evidence-review issues: ${response.status}`,
  );
const existing = (await response.json()).find(
  (issue) => issue.title === title && !issue.pull_request,
);

async function request(endpoint, method, payload) {
  const options = { method, headers };
  if (method !== 'GET' && method !== 'HEAD')
    options.body = JSON.stringify(payload);
  const result = await fetch(`${apiRoot}${endpoint}`, options);
  if (!result.ok)
    throw new Error(
      `Evidence-review notification failed: ${result.status} ${await result.text()}`,
    );
  return result.json();
}

if (!due.length) {
  if (existing) {
    await request(`/issues/${existing.number}/comments`, 'POST', {
      body: `No records are marked RETEST_REQUIRED after the ${monitor.freshnessEvaluatedOn} freshness evaluation. Closing this reminder did not change any evidence.`,
    });
    await request(`/issues/${existing.number}`, 'PATCH', { state: 'closed' });
    console.log(
      `Closed resolved evidence-review reminder #${existing.number}.`,
    );
  } else {
    console.log('No evidence review is due.');
  }
  process.exit(0);
}

const body = buildEvidenceReviewIssue(monitor, due);
if (!existing) {
  const milestones = await fetch(
    `${apiRoot}/milestones?state=open&per_page=100`,
    {
      headers,
    },
  );
  const milestone = milestones.ok
    ? (await milestones.json()).find(
        (item) =>
          item.title === 'Evidence automation and behavioral reproduction V1',
      )
    : null;
  const created = await request('/issues', 'POST', {
    title,
    body,
    assignees: ['diegolinan'],
    labels: ['review-required', 'model-evaluation'],
    ...(milestone ? { milestone: milestone.number } : {}),
  });
  console.log(`Opened evidence-review reminder #${created.number}.`);
  process.exit(0);
}

const previous = new Set(readEvidenceReviewMarker(existing.body));
const current = new Set(due.map((item) => item.id));
const added = [...current].filter((id) => !previous.has(id));
const removed = [...previous].filter((id) => !current.has(id));
if (existing.body !== body) {
  await request(`/issues/${existing.number}`, 'PATCH', { body });
}
if (added.length || removed.length) {
  await request(`/issues/${existing.number}/comments`, 'POST', {
    body: [
      '@diegolinan the deterministic due-review set changed.',
      added.length
        ? `Newly due: ${added.map((id) => `\`${id}\``).join(', ')}`
        : null,
      removed.length
        ? `No longer due: ${removed.map((id) => `\`${id}\``).join(', ')}`
        : null,
      'No behavioral probe or evidence decision was performed.',
    ]
      .filter(Boolean)
      .join('\n\n'),
  });
}
console.log(`Synchronized evidence-review reminder #${existing.number}.`);
