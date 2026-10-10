import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  allowedReviewFiles,
  classifyReviewPull,
} from '../worker/review-github.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const number = process.env.PULL_NUMBER;
const headSha = process.env.HEAD_SHA;
const baseSha = process.env.BASE_SHA;

if (!/^[-\w]+\/[-\w.]+$/.test(repo ?? ''))
  throw new Error('INVALID_REPOSITORY');
if (!/^\d+$/.test(number ?? '')) throw new Error('INVALID_PULL_NUMBER');
if (
  !/^[a-f0-9]{40}$/.test(headSha ?? '') ||
  !/^[a-f0-9]{40}$/.test(baseSha ?? '')
) {
  throw new Error('INVALID_COMMIT_ID');
}
if (!token) throw new Error('MISSING_GITHUB_TOKEN');
if (process.env.GITHUB_SHA !== baseSha) throw new Error('BASE_COMMIT_CHANGED');

async function api(path) {
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'eternal-tuesday-review-validation',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`GITHUB_READ_FAILED_${response.status}`);
  return response.json();
}

const proposal = await api(`/pulls/${number}`);
const main = await api('/branches/main');
const type = classifyReviewPull(proposal);
if (!type) throw new Error('NOT_ALLOWED_REVIEW_PROPOSAL');
if (proposal.head.sha !== headSha || main.commit.sha !== baseSha) {
  throw new Error('PROPOSAL_CHANGED');
}
if (proposal.changed_files > 30) throw new Error('TOO_MANY_FILES');

const files = await api(`/pulls/${number}/files?per_page=100`);
if (!allowedReviewFiles(type, files))
  throw new Error('UNEXPECTED_PROPOSAL_FILES');

for (const file of files) {
  const path = file.filename;
  const blob = await api(`/contents/${path}?ref=${headSha}`);
  if (blob.type !== 'file' || blob.encoding !== 'base64' || !blob.content) {
    throw new Error('UNEXPECTED_PROPOSAL_CONTENT');
  }
  const bytes = Buffer.from(blob.content.replace(/\s/g, ''), 'base64');
  if (bytes.length > 2_000_000) throw new Error('PROPOSAL_FILE_TOO_LARGE');
  await writeFile(resolve(root, path), bytes);
  console.log(`Materialized allowed data file: ${path}`);
}
