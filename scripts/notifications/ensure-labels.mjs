const definitions = {
  'community-lead': {
    color: '1d76db',
    description: 'Unverified lead submitted through the public service desk',
  },
  'evidence-candidate': {
    color: '8250df',
    description: 'Potential evidence that requires human review',
  },
  'evidence-decision': {
    color: '0e8a16',
    description: 'Append-only human decision about an evidence candidate',
  },
  'model-discovery': {
    color: '006b75',
    description: 'Official model identity or metadata proposed for review',
  },
  'model-evaluation': {
    color: 'b60205',
    description: 'Controlled behavioral evaluation proposed for review',
  },
  'notification-canary': {
    color: '6e7781',
    description: 'Temporary review-request notification check',
  },
  'review-required': {
    color: 'd4a72c',
    description: 'Requires a human decision and never auto-merges',
  },
  'supporting-source': {
    color: '5319e7',
    description: 'Supporting source proposed for existing canonical evidence',
  },
};

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const requested = process.argv.slice(2);
if (!repository || !token) throw new Error('GITHUB_CONTEXT_REQUIRED');
if (!requested.length) throw new Error('AT_LEAST_ONE_LABEL_REQUIRED');

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'User-Agent': 'eternal-tuesday-label-sync',
  'X-GitHub-Api-Version': '2022-11-28',
};
for (const name of requested) {
  const definition = definitions[name];
  if (!definition) throw new Error(`UNKNOWN_LABEL:${name}`);
  const endpoint = `https://api.github.com/repos/${repository}/labels/${encodeURIComponent(name)}`;
  const existing = await fetch(endpoint, { headers });
  if (existing.ok) continue;
  if (existing.status !== 404)
    throw new Error(`LABEL_LOOKUP_FAILED:${name}:${existing.status}`);
  const created = await fetch(
    `https://api.github.com/repos/${repository}/labels`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, ...definition }),
    },
  );
  if (!created.ok)
    throw new Error(`LABEL_CREATE_FAILED:${name}:${created.status}`);
}
console.log(`Confirmed ${requested.length} review label(s).`);
