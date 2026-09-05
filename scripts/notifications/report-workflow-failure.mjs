if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('GITHUB_ACTIONS_ONLY');
const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const headers = { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' };
const title = '[Automation failure] Official model discovery';
const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const list = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=100`, { headers });
if (!list.ok) throw new Error(`Unable to inspect failure issues: ${list.status}`);
const existing = (await list.json()).find((issue) => issue.title === title && !issue.pull_request);
const body = `The scheduled official-source discovery workflow failed. No behavioral conclusion is permitted from this failure.\n\n[Inspect run ${process.env.GITHUB_RUN_ID}](${runUrl})`;
const endpoint = existing
  ? `https://api.github.com/repos/${owner}/${repo}/issues/${existing.number}/comments`
  : `https://api.github.com/repos/${owner}/${repo}/issues`;
const payload = existing ? { body } : { title, body, assignees: ['diegolinan'] };
const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) });
if (!response.ok) throw new Error(`Unable to report workflow failure: ${response.status} ${await response.text()}`);
