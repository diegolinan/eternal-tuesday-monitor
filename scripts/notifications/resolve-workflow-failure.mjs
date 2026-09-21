import { resolveDiscoveryFailures } from './workflow-failure.mjs';

if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('GITHUB_ACTIONS_ONLY');
const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const resolved = await resolveDiscoveryFailures({
  owner,
  repo,
  runId: process.env.GITHUB_RUN_ID,
  token: process.env.GITHUB_TOKEN,
});

console.log(
  resolved.length
    ? `Closed recovered discovery failure issue(s): ${resolved.join(', ')}`
    : 'No open discovery failure issue requires recovery.',
);
