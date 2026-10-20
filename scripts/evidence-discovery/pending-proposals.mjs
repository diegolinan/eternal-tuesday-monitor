import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { normalizeUrl } from './core.mjs';

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

export function candidateRecordsFromPatch(patch) {
  if (typeof patch !== 'string') throw new Error('MISSING_CANDIDATE_PATCH');
  const records = [];
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
    if (record.source_url != null && typeof record.source_url !== 'string')
      throw new Error('INVALID_CANDIDATE_SOURCE_URL');
    records.push({
      id: record.id,
      source_url: record.source_url ? normalizeUrl(record.source_url) : null,
    });
  }
  return records;
}

export function candidateIdsFromPatch(patch) {
  return candidateRecordsFromPatch(patch).map((record) => record.id);
}

export function excludePendingCandidates(candidates, existingIds, pending) {
  const excludedIds = new Set([...existingIds, ...pending.ids]);
  const excludedUrls = new Set(pending.urls);
  return candidates.filter(
    (candidate) =>
      !excludedIds.has(candidate.id) &&
      (!candidate.source_url || !excludedUrls.has(normalizeUrl(candidate.source_url))),
  );
}

export async function pendingProposalCandidates({ repository, token, fetchImpl = fetch }) {
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
  const urls = new Set();
  for (const pull of pulls.filter((item) => isEvidenceProposal(item, repository))) {
    const files = await listPages(`/pulls/${pull.number}/files`);
    const candidateFile = files.find(
      (file) => file.filename === 'data/evidence-discovery/candidates.jsonl',
    );
    if (!candidateFile) throw new Error('MISSING_CANDIDATE_FILE');
    for (const candidate of candidateRecordsFromPatch(candidateFile.patch)) {
      ids.add(candidate.id);
      if (candidate.source_url) urls.add(candidate.source_url);
    }
  }
  return {
    ids: [...ids].sort((left, right) => left.localeCompare(right)),
    urls: [...urls].sort((left, right) => left.localeCompare(right)),
  };
}

export async function pendingProposalIds(options) {
  return (await pendingProposalCandidates(options)).ids;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pending = await pendingProposalCandidates({
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
  });
  const destination = path.join(root, '.evidence-discovery', 'pending-pr-candidates.json');
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(pending) + '\n');
  console.log(`Excluded ${pending.ids.length} candidate IDs and ${pending.urls.length} sources already awaiting review.`);
}
