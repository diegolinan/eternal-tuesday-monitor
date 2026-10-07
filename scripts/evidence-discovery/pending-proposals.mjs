import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../..', import.meta.url));

export function isEvidenceProposal(pull, repository) {
  return (
    pull.state === 'open' &&
    pull.base?.ref === 'main' &&
    pull.base?.repo?.full_name === repository &&
    pull.head?.repo?.full_name === repository &&
    /^automation\/evidence-candidates-\d+$/.test(pull.head?.ref ?? '') &&
    pull.user?.login === 'github-actions[bot]' &&
    pull.labels?.some((label) => label.name === 'evidence-candidate')
  );
}

export function candidateIdsFromPatch(patch) {
  if (typeof patch !== 'string') throw new Error('MISSING_CANDIDATE_PATCH');
  const ids = [];
  for (const line of patch.split('\n')) {
    if (!line.startsWith('+{')) continue;
    let record;
    try {
      record = JSON.parse(line.slice(1));
    } catch {
      throw new Error('INVALID_CANDIDATE_PATCH');
    }
    if (!/^evcand-[a-f0-9]{24}$/.test(record.id ?? ''))
      throw new Error('INVALID_CANDIDATE_ID');
    ids.push(record.id);
  }
  return ids;
}

export async function pendingProposalIds({ repository, token, fetchImpl = fetch }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !token)
    throw new Error('GITHUB_ACCESS_NOT_CONFIGURED');
  const request = async (route) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}${route}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) throw new Error(`GITHUB_REVIEW_LOOKUP_FAILED_${response.status}`);
    return response.json();
  };
  const listPages = async (route) => {
    const result = [];
    for (let page = 1; page <= 10; page += 1) {
      const batch = await request(`${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new Error('INVALID_GITHUB_RESPONSE');
      result.push(...batch);
      if (batch.length < 100) return result;
    }
    throw new Error('TOO_MANY_REVIEW_PROPOSALS');
  };
  const pulls = await listPages('/pulls?state=open');
  const ids = new Set();
  for (const pull of pulls.filter((item) => isEvidenceProposal(item, repository))) {
    const files = await listPages(`/pulls/${pull.number}/files`);
    const candidateFile = files.find(
      (file) => file.filename === 'data/evidence-discovery/candidates.jsonl',
    );
    if (!candidateFile) throw new Error('MISSING_CANDIDATE_FILE');
    for (const id of candidateIdsFromPatch(candidateFile.patch)) ids.add(id);
  }
  return [...ids].sort((left, right) => left.localeCompare(right));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ids = await pendingProposalIds({
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
  });
  const destination = path.join(root, '.evidence-discovery', 'pending-pr-ids.json');
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(ids) + '\n');
  console.log(`Excluded ${ids.length} candidate IDs already awaiting review.`);
}
