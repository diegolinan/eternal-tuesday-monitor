import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('workflows use Node 24 compatible JavaScript actions', async () => {
  const workflowDirectory = path.join(root, '.github', 'workflows');
  const workflowFiles = (await readdir(workflowDirectory)).filter((name) =>
    /\.ya?ml$/.test(name),
  );
  const workflows = await Promise.all(
    workflowFiles.map((name) => readFile(path.join(workflowDirectory, name), 'utf8')),
  );
  const combined = workflows.join('\n');
  assert.doesNotMatch(combined, /actions\/checkout@v4/);
  assert.doesNotMatch(combined, /actions\/setup-node@v4/);
  assert.doesNotMatch(combined, /actions\/(?:upload|download)-artifact@v4/);
  assert.doesNotMatch(combined, /actions\/configure-pages@v5/);
  assert.doesNotMatch(combined, /actions\/upload-pages-artifact@/);
  assert.doesNotMatch(combined, /actions\/deploy-pages@v4/);
  assert.doesNotMatch(combined, /create-pull-request@271a8d/);
});

test('every interpretive proposal uses a unique disposable review branch', async () => {
  const [intake, discovery, evaluation] = await Promise.all([
    read('.github/workflows/intake-evidence.yml'),
    read('.github/workflows/discover-models.yml'),
    read('.github/workflows/evaluate-model.yml'),
  ]);
  assert.match(
    intake,
    /community-evidence-\$\{\{ github\.event\.client_payload\.receiptId \}\}/,
  );
  assert.match(discovery, /model-discovery-\$\{\{ github\.run_id \}\}/);
  assert.match(discovery, /evidence-candidates-\$\{\{ github\.run_id \}\}/);
  assert.match(evaluation, /model-evaluation-\$\{\{ github\.run_id \}\}/);
  for (const workflow of [intake, discovery, evaluation]) {
    assert.match(workflow, /reviewers: diegolinan/);
    assert.match(workflow, /review-required/);
    assert.match(workflow, /delete-branch: true/);
    assert.doesNotMatch(workflow, /auto-merge|enable-auto-merge/i);
  }
});

test('candidate decision and source promotion remain separate review gates', async () => {
  const [review, promotion, promotionScript] = await Promise.all([
    read('.github/workflows/review-evidence-candidate.yml'),
    read('.github/workflows/promote-supporting-source.yml'),
    read('scripts/evidence-discovery/promote-supporting-source.mjs'),
  ]);
  assert.match(review, /ACCEPTED_AS_SUPPORTING_SOURCE/);
  assert.match(review, /REQUIRES_BEHAVIORAL_REPRODUCTION/);
  assert.match(review, /add-paths: data\/evidence-discovery\/reviews\.jsonl/);
  assert.match(promotion, /Active ACCEPTED_AS_SUPPORTING_SOURCE/);
  assert.match(promotion, /reviewers: diegolinan/);
  assert.doesNotMatch(promotion, /observations\.jsonl|results\.jsonl/);
  assert.match(promotionScript, /does not create an observation/i);
  assert.doesNotMatch(promotionScript, /result_status_id/);
});

test('candidate decisions serialize the append-only ledger and block parallel review PRs', async () => {
  const review = await read('.github/workflows/review-evidence-candidate.yml');
  assert.match(review, /group: evidence-review-ledger/);
  assert.match(
    review,
    /node scripts\/notifications\/assert-no-open-evidence-decision\.mjs/,
  );
  assert.doesNotMatch(review, /group: evidence-review-\$\{\{/);
});

test('the notification canary requests review and cannot be mistaken for evidence', async () => {
  const canary = await read(
    '.github/workflows/reviewer-notification-canary.yml',
  );
  assert.match(canary, /reviewers: diegolinan/);
  assert.match(canary, /Do not merge it/);
  assert.match(canary, /delete its disposable branch/);
  assert.doesNotMatch(canary, /deleted automatically/);
  assert.match(canary, /notification-canary/);
  assert.doesNotMatch(canary, /data\/evidence|data\/observations/);
});
