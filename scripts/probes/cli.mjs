import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { protocol, reservationUsd } from './protocol.mjs';
import {
  implementationHash,
  runPilot,
  safeError,
  verifyCandidate,
} from './pilot.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
try {
  if (args.length === 0) {
    console.log(
      JSON.stringify(
        {
          mode: 'PLAN_ONLY_NO_NETWORK',
          protocol,
          reservationUsd,
          implementationSha256: await implementationHash(root),
        },
        null,
        2,
      ),
    );
  } else if (args.length === 2 && args[0] === '--verify') {
    const candidate = JSON.parse(
      await readFile(path.resolve(root, args[1]), 'utf8'),
    );
    await verifyCandidate(root, candidate);
    console.log(
      JSON.stringify({
        verified: true,
        mode: candidate.mode,
        status: candidate.status,
        reviewStatus: candidate.reviewStatus,
        results: candidate.trials.map((trial) => trial.score.verdict),
      }),
    );
  } else if (
    args.length === 3 &&
    args[0] === '--live' &&
    args[1] === '--approval'
  ) {
    if (process.env.CI) throw new Error('MANUAL_ONLY_NO_CI');
    const approvalPath = await realpath(path.resolve(root, args[2]));
    const privateRoot = await realpath(path.join(root, '.probes'));
    if (!approvalPath.startsWith(privateRoot + path.sep))
      throw new Error('APPROVAL_MUST_BE_PRIVATE');
    const approval = JSON.parse(await readFile(approvalPath, 'utf8'));
    if (!process.env.OPENAI_API_KEY) {
      try {
        process.loadEnvFile(path.join(root, '.env.local'));
      } catch {
        throw new Error('KEY_MISSING_OR_INVALID');
      }
    }
    const { candidate } = await runPilot({
      root,
      approval,
      key: process.env.OPENAI_API_KEY,
    });
    await verifyCandidate(root, candidate);
    console.log(
      JSON.stringify(
        {
          status: candidate.status,
          error: candidate.error,
          reviewStatus: candidate.reviewStatus,
          results: candidate.trials.map((trial) => trial.score.verdict),
          knownUsageEstimateUsd: candidate.trials.reduce(
            (sum, trial) => sum + (trial.estimatedUsageUsd ?? 0),
            0,
          ),
          usageComplete:
            candidate.status === 'COMPLETED' &&
            candidate.trials.every((trial) => trial.estimatedUsageUsd !== null),
          reservationUsd,
        },
        null,
        2,
      ),
    );
    if (candidate.status !== 'COMPLETED') process.exitCode = 1;
  } else throw new Error('INVALID_ARGUMENTS');
} catch (error) {
  // Do not print SDK/fetch stacks, raw provider error messages or env content.
  console.error(safeError(error));
  process.exitCode = 1;
}
