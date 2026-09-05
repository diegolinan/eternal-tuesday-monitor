import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codexProtocol, codexArgs } from './codex-protocol.mjs';
import {
  codexImplementationHash,
  runCodexPilot,
  verifyCodexCandidate,
  safeCodexError,
} from './codex-runner.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
try {
  if (!args.length) {
    console.log(
      JSON.stringify(
        {
          mode: 'PLAN_ONLY_NO_NETWORK',
          protocol: codexProtocol,
          implementationSha256: await codexImplementationHash(root),
          parameters: codexArgs(
            '<APPROVED_MODEL>',
            '<EMPTY_WORKDIR>',
            '<ANSWER_SCHEMA>',
          ),
          approvalRequired:
            'Separate explicit approval of model, CLI binary/version, three invocations and non-enforceable monetary cap. API budget approval does not apply.',
        },
        null,
        2,
      ),
    );
  } else if (args.length === 2 && args[0] === '--verify') {
    const candidate = JSON.parse(
      await readFile(path.resolve(root, args[1]), 'utf8'),
    );
    await verifyCodexCandidate(root, candidate);
    console.log(
      JSON.stringify({
        verified: true,
        mode: candidate.mode,
        status: candidate.status,
        results: candidate.trials.map((trial) => trial.analysis.verdict),
      }),
    );
  } else if (
    args.length === 5 &&
    args[0] === '--live' &&
    args[1] === '--approval' &&
    args[3] === '--binary'
  ) {
    if (process.env.CI) throw new Error('MANUAL_ONLY_NO_CI');
    const approvalPath = await realpath(path.resolve(root, args[2]));
    const privateRoot = await realpath(path.join(root, '.probes', 'codex'));
    if (!approvalPath.startsWith(privateRoot + path.sep))
      throw new Error('APPROVAL_MUST_BE_PRIVATE');
    const approval = JSON.parse(await readFile(approvalPath, 'utf8'));
    const { candidate } = await runCodexPilot({
      root,
      approval,
      binary: args[4],
    });
    await verifyCodexCandidate(root, candidate);
    console.log(
      JSON.stringify(
        {
          status: candidate.status,
          error: candidate.error,
          reviewStatus: candidate.reviewStatus,
          results: candidate.trials.map((trial) => trial.analysis.verdict),
          usage: candidate.trials.map((trial) => trial.analysis.usage),
          billing: candidate.billing,
          requestedModel: candidate.requestedModel,
          returnedModel: candidate.returnedModel,
        },
        null,
        2,
      ),
    );
    if (candidate.status !== 'COMPLETED') process.exitCode = 1;
  } else throw new Error('INVALID_ARGUMENTS');
} catch (error) {
  console.error(safeCodexError(error));
  process.exitCode = 1;
}
