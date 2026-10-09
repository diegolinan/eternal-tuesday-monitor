const apiRoot = 'https://api.github.com';
let cachedToken = null;
const reviewBranches = [
  {
    prefix: 'automation/model-discovery-',
    label: 'model-discovery',
    kind: 'model',
    files: new Set([
      'data/catalog/models.json',
      'data/model-discovery/events.jsonl',
      'data/state-events/events.jsonl',
      'data/changelog/events.jsonl',
      'public/data/monitor.json',
      'public/data/changelog.json',
      'public/data/model-options.json',
      'public/data/model-operations.json',
    ]),
  },
  {
    prefix: 'automation/evidence-candidates-',
    label: 'evidence-candidate',
    kind: 'leads',
    files: new Set(['data/evidence-discovery/candidates.jsonl']),
  },
  {
    prefix: 'automation/evidence-decision-',
    label: 'evidence-decision',
    kind: 'decision',
    files: new Set(['data/evidence-discovery/reviews.jsonl']),
  },
];

const encode = (value) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(value)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

export function classifyReviewPull(pr) {
  if (pr?.base?.ref !== 'main' || pr?.state !== 'open') return null;
  if (pr?.head?.repo?.full_name !== pr?.base?.repo?.full_name) return null;
  if (pr?.user?.login !== 'github-actions[bot]') return null;
  const labels = new Set(pr.labels?.map((label) => label.name) ?? []);
  if (!labels.has('review-required')) return null;
  return (
    reviewBranches.find(
      (type) =>
        pr.head.ref.startsWith(type.prefix) &&
        /^[0-9]+$/.test(pr.head.ref.slice(type.prefix.length)) &&
        labels.has(type.label),
    ) ?? null
  );
}

export function allowedReviewFiles(type, files) {
  return (
    files.length > 0 &&
    files.length <= 30 &&
    files.every(
      (file) => type.files.has(file.filename) && file.status !== 'removed',
    )
  );
}

const requireRepo = (env) => {
  if (!/^[-\w]+\/[-\w.]+$/.test(env.GITHUB_REPOSITORY ?? '')) {
    throw new Error('REPOSITORY_NOT_CONFIGURED');
  }
  return env.GITHUB_REPOSITORY;
};

async function appInstallationToken(env) {
  const {
    GITHUB_APP_ID,
    GITHUB_APP_INSTALLATION_ID,
    GITHUB_APP_PRIVATE_KEY_PKCS8,
  } = env;
  if (
    !GITHUB_APP_ID ||
    !GITHUB_APP_INSTALLATION_ID ||
    !GITHUB_APP_PRIVATE_KEY_PKCS8
  ) {
    throw new Error('GITHUB_APP_NOT_CONFIGURED');
  }
  const cacheKey = `${GITHUB_APP_ID}:${GITHUB_APP_INSTALLATION_ID}`;
  if (
    cachedToken?.key === cacheKey &&
    cachedToken.expiresAt > Date.now() + 60_000
  ) {
    return cachedToken.value;
  }
  const raw = Uint8Array.from(atob(GITHUB_APP_PRIVATE_KEY_PKCS8), (char) =>
    char.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    'pkcs8',
    raw,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${encode(
    JSON.stringify({
      iat: now - 60,
      exp: now + 540,
      iss: String(GITHUB_APP_ID),
    }),
  )}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${btoa(
    String.fromCharCode(...new Uint8Array(signature)),
  )
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')}`;
  const response = await fetch(
    `${apiRoot}/app/installations/${encodeURIComponent(GITHUB_APP_INSTALLATION_ID)}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'eternal-tuesday-review',
      },
      body: JSON.stringify({
        repositories: [requireRepo(env).split('/')[1]],
        permissions: {
          actions: 'write',
          contents: 'read',
          pull_requests: 'write',
          issues: 'write',
        },
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw new Error('GITHUB_APP_AUTH_FAILED');
  const body = await response.json();
  if (!body.token) throw new Error('GITHUB_APP_AUTH_FAILED');
  cachedToken = {
    key: cacheKey,
    value: body.token,
    expiresAt: Date.parse(body.expires_at) || Date.now() + 30 * 60_000,
  };
  return body.token;
}

export async function githubApi(env, path, options = {}) {
  const repository = requireRepo(env);
  if (
    !path.startsWith(`/repos/${repository}/`) &&
    !path.startsWith(`/repos/${repository}?`)
  ) {
    throw new Error('GITHUB_PATH_OUT_OF_SCOPE');
  }
  const token = await appInstallationToken(env);
  const response = await fetch(`${apiRoot}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'eternal-tuesday-review',
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error('GITHUB_NOT_FOUND');
    if (response.status === 409 || response.status === 422)
      throw new Error('GITHUB_CONFLICT');
    throw new Error('GITHUB_UNAVAILABLE');
  }
  if (response.status === 204) return null;
  return response.json();
}

export const repoPath = (env, suffix) => `/repos/${requireRepo(env)}${suffix}`;

export async function publicationStatus(env) {
  const workflows = [
    { name: 'Vercel', file: 'vercel-candidate.yml' },
    { name: 'GitHub Pages', file: 'pages.yml' },
  ];
  return Promise.all(workflows.map(async ({ name, file }) => {
    const result = await githubApi(env, repoPath(env, `/actions/workflows/${file}/runs?branch=main&per_page=1`));
    const run = result.workflow_runs?.[0];
    return {
      name,
      status: run?.status ?? 'unknown',
      conclusion: run?.conclusion ?? null,
      updatedAt: run?.updated_at ?? null,
      url: run?.html_url ?? null,
      headSha: run?.head_sha ?? null,
    };
  }));
}

export async function listOpenReviewPulls(env) {
  const items = [];
  for (let page = 1; page <= 4; page++) {
    const batch = await githubApi(
      env,
      repoPath(env, `/pulls?state=open&per_page=100&page=${page}`),
    );
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items
    .map((pr) => ({ pr, type: classifyReviewPull(pr) }))
    .filter(({ type }) => type)
    .map(({ pr, type }) => ({
      number: pr.number,
      title: pr.title,
      kind: type.kind,
      createdAt: pr.created_at,
      url: pr.html_url,
      headSha: pr.head.sha,
      body: String(pr.body ?? '').slice(0, 12000),
    }));
}

export async function readLedger(env, path, ref = 'main') {
  const result = await githubApi(
    env,
    repoPath(env, `/contents/${path}?ref=${encodeURIComponent(ref)}`),
  );
  if (!result?.content || result.encoding !== 'base64')
    throw new Error('GITHUB_CONTENT_UNAVAILABLE');
  const bytes = Uint8Array.from(
    atob(result.content.replace(/\s/g, '')),
    (char) => char.charCodeAt(0),
  );
  return new TextDecoder()
    .decode(bytes)
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse);
}

export async function getReviewPull(env, number) {
  const pr = await githubApi(env, repoPath(env, `/pulls/${number}`));
  const type = classifyReviewPull(pr);
  if (!type) throw new Error('NOT_REVIEW_PROPOSAL');
  if (pr.changed_files > 30) throw new Error('TOO_MANY_FILES');
  const files = await githubApi(
    env,
    repoPath(env, `/pulls/${number}/files?per_page=100`),
  );
  if (!allowedReviewFiles(type, files)) throw new Error('UNEXPECTED_PR_FILES');
  const validation = await reviewValidation(env, pr);
  let additions = [];
  if (type.kind === 'leads' || type.kind === 'decision') {
    const ledger =
      type.kind === 'leads'
        ? 'data/evidence-discovery/candidates.jsonl'
        : 'data/evidence-discovery/reviews.jsonl';
    const [before, after] = await Promise.all([
      readLedger(env, ledger),
      readLedger(env, ledger, pr.head.sha),
    ]);
    const known = new Set(before.map((entry) => entry.id));
    additions = after.filter((entry) => !known.has(entry.id));
  }
  return {
    number: pr.number,
    title: pr.title,
    body: String(pr.body ?? '').slice(0, 12000),
    kind: type.kind,
    url: pr.html_url,
    headSha: pr.head.sha,
    baseSha: pr.base.sha,
    mergeCommitSha: pr.merge_commit_sha,
    mergeable: pr.mergeable,
    mergeableState: pr.mergeable_state,
    validation,
    files: files.map((file) => ({
      name: file.filename,
      additions: file.additions,
      deletions: file.deletions,
    })),
    additions,
  };
}

async function reviewValidation(env, pr) {
  const result = await githubApi(
    env,
    repoPath(
      env,
      '/actions/workflows/validate-review-proposal.yml/runs?branch=main&event=workflow_dispatch&per_page=100',
    ),
  );
  const title = `review-${pr.number}-${pr.head.sha}-${pr.base.sha}`;
  const run = result.workflow_runs?.find(
    (item) => item.display_title === title,
  );
  if (!run) return { state: 'not_run' };
  return {
    state:
      run.status !== 'completed'
        ? 'running'
        : run.conclusion === 'success'
          ? 'passed'
          : 'failed',
    runId: run.id,
    url: run.html_url,
  };
}

export async function validateReviewPull(env, number, expectedSha) {
  const proposal = await getReviewPull(env, number);
  if (proposal.headSha !== expectedSha) throw new Error('PROPOSAL_CHANGED');
  if (proposal.validation.state === 'running')
    throw new Error('VALIDATION_ALREADY_RUNNING');
  await githubApi(
    env,
    repoPath(env, '/actions/workflows/validate-review-proposal.yml/dispatches'),
    {
      method: 'POST',
      body: {
        ref: 'main',
        inputs: {
          pull_number: String(number),
          head_sha: expectedSha,
          base_sha: proposal.baseSha,
        },
      },
    },
  );
  return { queued: true };
}

export async function mergeReviewPull(env, number, expectedSha) {
  const proposal = await getReviewPull(env, number);
  if (proposal.headSha !== expectedSha) throw new Error('PROPOSAL_CHANGED');
  if (proposal.mergeable !== true || proposal.mergeableState !== 'clean') {
    throw new Error('PROPOSAL_NOT_READY');
  }
  if (proposal.validation.state !== 'passed')
    throw new Error('VALIDATION_NOT_PASSED');
  const result = await githubApi(env, repoPath(env, `/pulls/${number}/merge`), {
    method: 'PUT',
    body: { sha: expectedSha, merge_method: 'squash' },
  });
  if (!result?.merged) throw new Error('MERGE_NOT_CONFIRMED');
  return { merged: true, sha: result.sha };
}

export async function closeReviewPull(
  env,
  number,
  expectedSha,
  reason,
  reviewer,
) {
  const proposal = await getReviewPull(env, number);
  if (proposal.headSha !== expectedSha) throw new Error('PROPOSAL_CHANGED');
  const cleanReason = String(reason ?? '').trim();
  if (cleanReason.length < 20 || cleanReason.length > 1200)
    throw new Error('INVALID_REASON');
  await githubApi(env, repoPath(env, `/issues/${number}/comments`), {
    method: 'POST',
    body: {
      body: `Closed from the private review inbox by ${reviewer}.\n\nReason: ${cleanReason}`,
    },
  });
  await githubApi(env, repoPath(env, `/pulls/${number}`), {
    method: 'PATCH',
    body: { state: 'closed' },
  });
  return { closed: true };
}

export async function dispatchCandidateReview(
  env,
  candidateId,
  decision,
  reason,
  reviewer,
) {
  const candidates = await readLedger(
    env,
    'data/evidence-discovery/candidates.jsonl',
  );
  const candidate = candidates.find((item) => item.id === candidateId);
  if (!candidate)
    throw new Error('UNKNOWN_CANDIDATE');
  if (
    decision === 'RETAINED_AS_RESEARCH' &&
    candidate.claim_class !== 'RESEARCH_RESULT'
  )
    throw new Error('RESEARCH_DECISION_REQUIRES_RESEARCH_RESULT');
  const reviews = await readLedger(
    env,
    'data/evidence-discovery/reviews.jsonl',
  );
  if (
    reviews.some(
      (review) =>
        review.candidate_id === candidateId &&
        !reviews.some((other) => other.supersedes_review_id === review.id),
    )
  ) {
    throw new Error('CANDIDATE_ALREADY_REVIEWED');
  }
  const pending = (await listOpenReviewPulls(env)).some(
    (pr) => pr.kind === 'decision',
  );
  if (pending) throw new Error('DECISION_ALREADY_PENDING');
  await githubApi(
    env,
    repoPath(
      env,
      '/actions/workflows/review-evidence-candidate.yml/dispatches',
    ),
    {
      method: 'POST',
      body: {
        ref: 'main',
        inputs: {
          candidate_id: candidateId,
          decision,
          reason,
          reviewer_identity: reviewer,
        },
      },
    },
  );
  return { queued: true };
}
