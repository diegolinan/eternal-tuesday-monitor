import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadScheduledCodexPolicy,
  runScheduledCodex,
  safeCodexError,
  stageScheduledCodexCandidate,
  validateScheduledCodexPolicy,
  verifyScheduledCodexCandidate,
} from './codex-scheduled.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);

async function candidatesAt(input) {
  const resolved = path.resolve(root, input);
  if ((await stat(resolved)).isFile()) return [resolved];
  return (await readdir(resolved))
    .filter((name) => /^scheduled-codex-luna-.*\.json$/.test(name))
    .map((name) => path.join(resolved, name));
}

try {
  if (!args.length) {
    const policy = await loadScheduledCodexPolicy(root);
    validateScheduledCodexPolicy(policy);
    console.log(
      JSON.stringify({
        mode: 'PLAN_ONLY_NO_INFERENCE',
        model: policy.model,
        reasoningEffort: policy.reasoning_effort,
        limits: policy.limits,
        review: policy.review,
      }),
    );
  } else if (args.length === 1 && args[0] === '--live') {
    const candidate = await runScheduledCodex({ root });
    await verifyScheduledCodexCandidate(root, candidate);
    console.log(
      JSON.stringify({
        status: candidate.status,
        error: candidate.error,
        candidateReady: candidate.candidateReady,
        results: candidate.trials.map((trial) => trial.verdict),
      }),
    );
    if (!candidate.candidateReady) process.exitCode = 1;
  } else if (args.length === 2 && args[0] === '--verify') {
    const files = await candidatesAt(args[1]);
    if (!files.length) throw new Error('CANDIDATE_NOT_FOUND');
    for (const file of files)
      await verifyScheduledCodexCandidate(
        root,
        JSON.parse(await readFile(file, 'utf8')),
      );
    console.log(JSON.stringify({ verified: files.length }));
  } else if (args.length === 2 && args[0] === '--stage') {
    const files = await candidatesAt(args[1]);
    if (files.length !== 1) throw new Error('ONE_CANDIDATE_REQUIRED');
    const relative = await stageScheduledCodexCandidate(
      root,
      JSON.parse(await readFile(files[0], 'utf8')),
    );
    console.log(JSON.stringify({ staged: relative }));
  } else throw new Error('INVALID_ARGUMENTS');
} catch (error) {
  console.error(safeCodexError(error));
  process.exitCode = 1;
}
