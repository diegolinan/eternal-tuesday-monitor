import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  loadAutomatedPolicy,
  runAutomatedCandidate,
  stageAutomatedCandidate,
  validateAutomatedPolicy,
  verifyAutomatedCandidate,
} from './automated.mjs';
import {
  expectedAnswer,
  makeCases,
  makeRequest,
  protocol,
} from './protocol.mjs';
import { safeError } from './pilot.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const fixtureKey = 'fixture-only-not-a-real-secret';

const fixtureFetch = async (_url, options) => {
  if (options.method === 'GET')
    return new Response(JSON.stringify({ id: protocol.model }));
  const request = JSON.parse(options.body);
  const testCase = makeCases(fixtureNow()).find(
    (item) => makeRequest(item).input === request.input,
  );
  if (!testCase) throw new Error('FIXTURE_REQUEST_MISMATCH');
  const answer = expectedAnswer(testCase.referenceUtc, testCase.offsetHours);
  return new Response(
    JSON.stringify({
      id: 'fixture-response',
      model: 'gpt-5.4-mini-2026-03-17',
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: JSON.stringify(answer) }],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 30, total_tokens: 130 },
    }),
  );
};
const fixtureNow = () => '2026-09-05T12:00:00.000Z';

try {
  if (args.length === 0) {
    const policy = await loadAutomatedPolicy(root);
    validateAutomatedPolicy(policy);
    console.log(
      JSON.stringify({
        mode: 'PLAN_ONLY_NO_NETWORK',
        executionEnabled: policy.execution_enabled,
        target: policy.target,
        limits: policy.limits,
        review: policy.review,
      }),
    );
  } else if (args.length === 1 && args[0] === '--live') {
    const candidate = await runAutomatedCandidate({
      root,
      key: process.env.OPENAI_API_KEY,
    });
    await verifyAutomatedCandidate(root, candidate);
    console.log(
      JSON.stringify({
        status: candidate.status,
        error: candidate.error,
        candidateReady: candidate.candidateReady,
      }),
    );
    if (candidate.status === 'ABORTED') process.exitCode = 1;
  } else if (args.length === 1 && args[0] === '--fixture') {
    const candidate = await runAutomatedCandidate({
      root,
      key: fixtureKey,
      fetchImpl: fixtureFetch,
      now: fixtureNow,
      mode: 'FIXTURE',
      allowDisabledFixture: true,
      outputPath: path.join(root, '.probe-candidates', 'fixture.json'),
    });
    await verifyAutomatedCandidate(root, candidate);
    console.log(
      JSON.stringify({ fixtureVerified: true, candidateReady: true }),
    );
  } else if (args.length === 2 && args[0] === '--verify') {
    const candidate = JSON.parse(await readFile(path.resolve(args[1]), 'utf8'));
    await verifyAutomatedCandidate(root, candidate);
    console.log(JSON.stringify({ verified: true }));
  } else if (args.length === 2 && args[0] === '--stage') {
    if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('STAGE_CI_ONLY');
    const candidate = JSON.parse(await readFile(path.resolve(args[1]), 'utf8'));
    const file = await stageAutomatedCandidate(root, candidate);
    console.log(JSON.stringify({ staged: file }));
  } else throw new Error('INVALID_ARGUMENTS');
} catch (error) {
  console.error(safeError(error));
  process.exitCode = 1;
}
