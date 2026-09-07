import { pathToFileURL } from 'node:url';

export function openEvidenceDecisionPulls(items) {
  if (!Array.isArray(items)) throw new Error('INVALID_GITHUB_RESPONSE');
  return items.filter((item) => item?.pull_request && Number.isInteger(item.number));
}

export async function assertNoOpenEvidenceDecision({
  repository,
  token,
  fetchImpl = fetch,
}) {
  if (!repository || !token) throw new Error('GITHUB_CONTEXT_REQUIRED');

  const endpoint = new URL(
    `https://api.github.com/repos/${repository}/issues`,
  );
  endpoint.searchParams.set('state', 'open');
  endpoint.searchParams.set('labels', 'evidence-decision');
  endpoint.searchParams.set('per_page', '100');

  const response = await fetchImpl(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'eternal-tuesday-review-lock',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok)
    throw new Error(`OPEN_DECISION_LOOKUP_FAILED:${response.status}`);

  const openPulls = openEvidenceDecisionPulls(await response.json());
  if (openPulls.length) {
    const references = openPulls.map(({ number }) => `#${number}`).join(', ');
    throw new Error(
      `OPEN_EVIDENCE_DECISION_EXISTS:${references}. Merge or close it before reviewing another candidate.`,
    );
  }

  console.log('No open evidence-decision pull request exists.');
}

const invokedPath = process.argv[1] && pathToFileURL(process.argv[1]).href;
if (invokedPath === import.meta.url) {
  await assertNoOpenEvidenceDecision({
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
  });
}
