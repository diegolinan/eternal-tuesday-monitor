import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {
  classifyReviewPull,
  allowedReviewFiles,
} from '../worker/review-github.mjs';
import reviewWorker from '../worker/review.mjs';
import { reviewHtml, reviewCss, reviewJs } from '../worker/review-ui.mjs';

const env = {
  REVIEW_ACCESS_AUD: 'test-audience',
  REVIEWER_EMAILS: 'reviewer@example.test',
  REVIEW_WRITE_ENABLED: 'false',
};
const ctx = {
  access: {
    aud: 'test-audience',
    getIdentity: async () => ({ email: 'reviewer@example.test' }),
  },
};

const proposal = (overrides = {}) => ({
  state: 'open',
  base: {
    ref: 'main',
    repo: { full_name: 'diegolinan/eternal-tuesday-monitor' },
  },
  head: {
    ref: 'automation/evidence-candidates-123',
    repo: { full_name: 'diegolinan/eternal-tuesday-monitor' },
  },
  user: { login: 'github-actions[bot]' },
  labels: [{ name: 'review-required' }, { name: 'evidence-candidate' }],
  ...overrides,
});

test('only expected automation pull requests enter the private review queue', () => {
  assert.equal(classifyReviewPull(proposal())?.kind, 'leads');
  assert.equal(
    classifyReviewPull(proposal({ user: { login: 'someone-else' } })),
    null,
  );
  assert.equal(
    classifyReviewPull(
      proposal({
        base: {
          ref: 'dev',
          repo: { full_name: 'diegolinan/eternal-tuesday-monitor' },
        },
      }),
    ),
    null,
  );
  assert.equal(
    classifyReviewPull(
      proposal({
        head: {
          ref: 'automation/evidence-candidates-123',
          repo: { full_name: 'attacker/fork' },
        },
      }),
    ),
    null,
  );
  assert.equal(classifyReviewPull(proposal({ labels: [] })), null);
});

test('proposal file allowlist rejects unrelated code and deletions', () => {
  const type = classifyReviewPull(proposal());
  assert.equal(
    allowedReviewFiles(type, [
      {
        filename: 'data/evidence-discovery/candidates.jsonl',
        status: 'modified',
      },
    ]),
    true,
  );
  assert.equal(
    allowedReviewFiles(type, [
      { filename: '.github/workflows/validate.yml', status: 'modified' },
    ]),
    false,
  );
  assert.equal(
    allowedReviewFiles(type, [
      {
        filename: 'data/evidence-discovery/candidates.jsonl',
        status: 'removed',
      },
    ]),
    false,
  );
  assert.equal(allowedReviewFiles(type, []), false);
});

test('private worker fails closed without verified Access identity', async () => {
  const request = new Request('https://review.example.test/');
  const missing = await reviewWorker.fetch(request, env, {});
  assert.equal(missing.status, 403);
  const wrong = await reviewWorker.fetch(request, env, {
    access: { aud: 'wrong', getIdentity: ctx.access.getIdentity },
  });
  assert.equal(wrong.status, 403);
  const unlisted = await reviewWorker.fetch(request, env, {
    access: {
      aud: 'test-audience',
      getIdentity: async () => ({ email: 'other@example.test' }),
    },
  });
  assert.equal(unlisted.status, 403);
});

test('review actions are disabled until private credentials and approval are configured', async () => {
  const request = new Request(
    'https://review.example.test/api/pulls/75/merge',
    {
      method: 'POST',
      headers: {
        Origin: 'https://review.example.test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ headSha: 'a'.repeat(40) }),
    },
  );
  const response = await reviewWorker.fetch(request, env, ctx);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'REVIEW_WRITES_DISABLED');
});

test('cross-origin mutation is refused before any GitHub call', async () => {
  const request = new Request(
    'https://review.example.test/api/pulls/75/merge',
    {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example.test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ headSha: 'a'.repeat(40) }),
    },
  );
  const response = await reviewWorker.fetch(
    request,
    { ...env, REVIEW_WRITE_ENABLED: 'true' },
    ctx,
  );
  assert.equal(response.status, 403);
});

test('private page is served without exposing credentials and client script parses', async () => {
  const response = await reviewWorker.fetch(
    new Request('https://review.example.test/'),
    env,
    ctx,
  );
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get('Content-Security-Policy'),
    /script-src 'self'/,
  );
  assert.doesNotMatch(await response.text(), /GITHUB_APP_PRIVATE_KEY/);
  assert.doesNotThrow(() => new vm.Script(reviewJs));
  assert.doesNotMatch(reviewJs, /\b(?:window\.)?(?:prompt|confirm)\s*\(/);
  assert.match(reviewJs, /askInPage\(detail/);
  assert.match(reviewJs, /reason\.minLength=20/);
  assert.match(reviewJs, /PRODUCTO SUGERIDO/);
  assert.match(reviewJs, /SUPERFICIE SUGERIDA/);
  assert.match(reviewJs, /RETAINED_AS_RESEARCH/);
  assert.match(reviewJs, /item\.claimClass==='RESEARCH_RESULT'/);
});

test('review design uses the public tokens and protects shared fonts', async () => {
  const publicCss = await readFile(new URL('../app/typesafe-reference.css', import.meta.url), 'utf8');
  for (const [name, value] of [['pink', '#f386a1'], ['cyan', '#00c8d0'], ['yellow', '#fee857']]) {
    assert.match(publicCss, new RegExp(`--${name}:\\s*${value}`));
    assert.match(reviewCss, new RegExp(`--${name}:${value}`));
  }
  assert.match(reviewCss, /die-grotesk-regular\.woff2/);
  assert.match(reviewCss, /lisa-terminal\.woff2/);
  const config = await readFile(new URL('../wrangler.review.jsonc', import.meta.url), 'utf8');
  assert.match(config, /"run_worker_first": true/);
  assert.match(config, /"REVIEW_WRITE_ENABLED": "true"/);
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts['review:deploy'], /--keep-vars --strict/);
  let assetCalls = 0;
  const fontEnv = { ...env, ASSETS: { fetch: async () => { assetCalls++; return new Response('font'); } } };
  const request = new Request('https://review.example.test/lisa-terminal.woff2');
  assert.equal((await reviewWorker.fetch(request, fontEnv, {})).status, 403);
  assert.equal(assetCalls, 0);
  const response = await reviewWorker.fetch(request, fontEnv, ctx);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'font/woff2');
  assert.equal(assetCalls, 1);
  assert.equal((await reviewWorker.fetch(new Request('https://review.example.test/inter-latin.woff2'), fontEnv, ctx)).status, 404);
});

test('candidate lifecycle is visible and refresh preserves unfinished reviews', () => {
  assert.match(reviewHtml, /01 DETECTADO.*02 INCORPORADO.*03 DECIDIDO.*04 PUBLICADO/);
  assert.match(reviewJs, /DETECTADO · REVISIÓN PENDIENTE/);
  assert.match(reviewJs, /INCORPORADO · DECISIÓN PENDIENTE/);
  assert.match(reviewJs, /state\.previews\.set\(cacheKey/);
  assert.match(reviewJs, /reviewInProgress\(\)/);
  assert.match(reviewJs, /visibilitychange/);
  assert.match(reviewJs, /setInterval\(\(\)=>\{if\(document\.visibilityState==='visible'\)refreshDesk\(\)\},90000\)/);
  assert.match(reviewHtml, /id="publication-status"/);
});

test('manual validation runs trusted main code and materializes only allowed data', async () => {
  const workflow = await readFile(
    new URL(
      '../.github/workflows/validate-review-proposal.yml',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(workflow, /run: node scripts\/materialize-review-proposal\.mjs/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ inputs\.head_sha \}\}/);
  assert.doesNotMatch(workflow, /cache: npm/);
  assert.match(workflow, /persist-credentials: false/);
});
