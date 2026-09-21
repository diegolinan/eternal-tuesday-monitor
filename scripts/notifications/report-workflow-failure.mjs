import { reportDiscoveryFailure } from './workflow-failure.mjs';

if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('GITHUB_ACTIONS_ONLY');
const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
await reportDiscoveryFailure({
  owner,
  repo,
  runId: process.env.GITHUB_RUN_ID,
  token: process.env.GITHUB_TOKEN,
});
