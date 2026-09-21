export const discoveryFailureTitle =
  '[Automation failure] Official model discovery';

export function openDiscoveryFailureIssues(issues) {
  return issues.filter(
    (issue) =>
      issue.title === discoveryFailureTitle &&
      !issue.pull_request &&
      issue.state === 'open',
  );
}

function apiHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function requireOk(response, action) {
  if (!response.ok) {
    throw new Error(`${action}: ${response.status} ${await response.text()}`);
  }
  return response;
}

async function listOpenIssues({ owner, repo, token, fetchImpl }) {
  const response = await fetchImpl(
    `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=100`,
    { headers: apiHeaders(token) },
  );
  await requireOk(response, 'Unable to inspect failure issues');
  return openDiscoveryFailureIssues(await response.json());
}

export async function reportDiscoveryFailure({
  owner,
  repo,
  runId,
  token,
  fetchImpl = fetch,
}) {
  const existing = (
    await listOpenIssues({ owner, repo, token, fetchImpl })
  )[0];
  const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${runId}`;
  const body = `The scheduled official-source discovery workflow failed. No behavioral conclusion is permitted from this failure.\n\n[Inspect run ${runId}](${runUrl})`;
  const endpoint = existing
    ? `https://api.github.com/repos/${owner}/${repo}/issues/${existing.number}/comments`
    : `https://api.github.com/repos/${owner}/${repo}/issues`;
  const payload = existing
    ? { body }
    : { title: discoveryFailureTitle, body, assignees: ['diegolinan'] };
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: apiHeaders(token),
    body: JSON.stringify(payload),
  });
  await requireOk(response, 'Unable to report workflow failure');
  return existing?.number ?? null;
}

export async function resolveDiscoveryFailures({
  owner,
  repo,
  runId,
  token,
  fetchImpl = fetch,
}) {
  const issues = await listOpenIssues({ owner, repo, token, fetchImpl });
  const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${runId}`;
  const body = `The official-source discovery workflow recovered successfully.\n\n[Inspect successful run ${runId}](${runUrl})`;

  for (const issue of issues) {
    const base = `https://api.github.com/repos/${owner}/${repo}/issues/${issue.number}`;
    const comment = await fetchImpl(`${base}/comments`, {
      method: 'POST',
      headers: apiHeaders(token),
      body: JSON.stringify({ body }),
    });
    await requireOk(comment, `Unable to comment on recovered issue ${issue.number}`);

    const close = await fetchImpl(base, {
      method: 'PATCH',
      headers: apiHeaders(token),
      body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
    });
    await requireOk(close, `Unable to close recovered issue ${issue.number}`);
  }

  return issues.map((issue) => issue.number);
}
