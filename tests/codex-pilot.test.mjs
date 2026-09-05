import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { makeCases, expectedAnswer } from '../scripts/probes/time-cases.mjs';
import {
  codexProtocol,
  codexArgs,
  codexPrompt,
  childEnvironment,
  capture,
  analyze,
} from '../scripts/probes/codex-protocol.mjs';
import {
  binaryHash,
  codexImplementationHash,
  checkCodexApproval,
  runCodexPilot,
  verifyCodexCandidate,
  executeCodexProcess,
} from '../scripts/probes/codex-runner.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const now = () => '2026-09-05T00:01:00.000Z';
const cases = makeCases(now());
const binary = process.execPath;
const approval = async (changes = {}) => ({
  id: 'codex-offline-test',
  protocol: codexProtocol.id,
  implementationSha256: await codexImplementationHash(root),
  model: 'gpt-5.4-mini',
  binarySha256: await binaryHash(binary),
  cliVersion: 'codex-cli 0.142.0',
  issuedAt: '2026-09-05T00:00:00.000Z',
  expiresAt: '2026-09-06T00:00:00.000Z',
  maxInvocations: 3,
  acceptUncappedWorkspaceUsage: true,
  ...changes,
});
function events(
  answer,
  extras = [],
  usage = { input_tokens: 14000, output_tokens: 20 },
) {
  return (
    [
      { type: 'thread.started', thread_id: 'fixture' },
      { type: 'turn.started' },
      ...extras,
      {
        type: 'item.completed',
        item: { type: 'agent_message', text: JSON.stringify(answer) },
      },
      { type: 'turn.completed', usage },
    ]
      .map((item) => JSON.stringify(item))
      .join('\n') + '\n'
  );
}
const fixture = async (_binary, args, options) => {
  if (args[0] === '--version') return capture('codex-cli 0.142.0\n');
  if (args[0] === 'login') return capture('', 'Logged in using ChatGPT\n');
  const testCase = cases.find((item) => codexPrompt(item) === options.prompt);
  assert.ok(testCase);
  assert.deepEqual(
    args,
    codexArgs(
      'gpt-5.4-mini',
      options.directory,
      path.join(options.directory, 'answer.schema.json'),
    ),
  );
  return capture(
    events(expectedAnswer(testCase.referenceUtc, testCase.offsetHours)),
  );
};
const options = async (changes = {}) => ({
  root,
  approval: await approval(),
  binary,
  mode: 'FIXTURE',
  executor: fixture,
  now,
  privateDir: await mkdtemp(path.join(tmpdir(), 'etm-codex-fixture-')),
  ...changes,
});

test('Codex is a separate surface with no monetary or returned-model claim', () => {
  assert.equal(codexProtocol.surface, 'experimental-codex-cli-chatgpt-local');
  assert.equal(codexProtocol.monetaryCapEnforced, false);
  const args = codexArgs('gpt-5.4-mini', 'empty', 'schema');
  for (const control of [
    '--ephemeral',
    '--ignore-user-config',
    '--strict-config',
    'read-only',
    'features.apps=false',
    'features.shell_tool=false',
    'features.hooks=false',
    'features.multi_agent=false',
  ])
    assert.ok(args.includes(control));
  assert.equal(args.at(-1), '-');
  assert.ok(!args.includes('resume'));
});
test('child environment excludes API keys, access tokens and provider overrides without mutating parent', () => {
  const env = {
    Path: 'os-path',
    USERPROFILE: 'profile',
    CODEX_API_KEY: 'secret',
    CODEX_ACCESS_TOKEN: 'secret',
    OPENAI_BASE_URL: 'https://invalid',
    NODE_OPTIONS: '--import bad',
    GITHUB_TOKEN: 'secret',
  };
  assert.deepEqual(childEnvironment(env), {
    Path: 'os-path',
    USERPROFILE: 'profile',
  });
});
test('redaction preserves integrity while invalidating behavioral scoring', () => {
  const result = capture(
    events(expectedAnswer(now(), 0)),
    'sk-fixture-secret Bearer fake-token eyJfake.evidence.signature',
  );
  assert.ok(result.redacted);
  assert.ok(!result.stderr.includes('fake-token'));
  assert.equal(analyze(cases[0], result).verdict, 'INCONCLUSIVE');
});
test('oracle handles UTC midnight, year and leap-day boundaries', () => {
  assert.deepEqual(expectedAnswer('2024-03-01T00:01:00.000Z', -12), {
    date: '2024-02-29',
    weekday: 'Thursday',
  });
  assert.deepEqual(expectedAnswer('2025-12-31T23:01:00.000Z', 14), {
    date: '2026-01-01',
    weekday: 'Thursday',
  });
});
test('strict Codex replay separates MATCH, MISMATCH and operational errors', () => {
  assert.equal(
    analyze(cases[0], capture(events(expectedAnswer(now(), 0)))).verdict,
    'MATCH',
  );
  assert.equal(
    analyze(
      cases[0],
      capture(events({ date: '1999-01-01', weekday: 'Friday' })),
    ).verdict,
    'MISMATCH',
  );
  for (const result of [
    capture('not json'),
    capture(events({ date: 'x' })),
    capture(events({}, [{ type: 'error', message: 'reconnecting' }])),
    capture(
      events({}, [
        { type: 'item.started', item: { type: 'command_execution' } },
      ]),
    ),
    capture(events({}, [], null)),
    capture(events({}, [], { input_tokens: 40000, output_tokens: 10 })),
    capture(events({}, [], { input_tokens: 10, output_tokens: 1000 })),
    capture(events({}), '', 1),
    capture('', '', null, 'PROCESS_TIMEOUT'),
    capture(events({}).replace('turn.completed', 'turn.started')),
  ])
    assert.equal(analyze(cases[0], result).verdict, 'INCONCLUSIVE');
});
test('Codex approvals reject API-shaped, expired, stale-code and uncapped-consent-missing records', async () => {
  for (const changes of [
    { protocol: 'temporal-anchor-explicit-offset-pilot-1' },
    { acceptUncappedWorkspaceUsage: false },
    { expiresAt: now() },
    { issuedAt: '2026-09-06T00:00:00.000Z' },
    { expiresAt: '2026-09-07T00:00:00.000Z' },
    { implementationSha256: '0'.repeat(64) },
    { model: '--other-provider' },
    { budgetUsd: 1 },
  ])
    await assert.rejects(
      checkCodexApproval(root, await approval(changes), now()),
    );
  await assert.rejects(
    checkCodexApproval(root, await approval(), now(), '1'),
    /KILL_SWITCH/,
  );
});
test('fixture run preserves three requests and pending evidence; receipt blocks all approval IDs', async () => {
  const opts = await options();
  const { candidate, directory } = await runCodexPilot(opts);
  assert.equal(candidate.status, 'COMPLETED');
  assert.equal(candidate.mode, 'FIXTURE');
  assert.equal(candidate.returnedModel, null);
  assert.equal(candidate.billing.costUsd, null);
  assert.equal(candidate.reviewStatus, 'PENDING_REVIEW');
  assert.deepEqual(
    candidate.trials.map((trial) => trial.analysis.verdict),
    ['MATCH', 'MATCH', 'MATCH'],
  );
  assert.equal((await readdir(directory)).length, 8);
  assert.equal(await verifyCodexCandidate(root, candidate), true);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(directory, 'candidate.json'), 'utf8')),
    candidate,
  );
  await assert.rejects(
    runCodexPilot({
      ...opts,
      approval: { ...opts.approval, id: 'another-id' },
    }),
    /EEXIST/,
  );
});
test('runner stops at first inconclusive result and never retries or sends later cases', async () => {
  let calls = 0;
  const opts = await options({
    executor: async (binary, args, params) => {
      if (args[0] !== 'exec') return fixture(binary, args, params);
      calls++;
      return capture(events({}, [{ type: 'error', message: 'quota' }]));
    },
  });
  const { candidate } = await runCodexPilot(opts);
  assert.equal(calls, 1);
  assert.equal(candidate.status, 'ABORTED');
  assert.equal(candidate.trials.length, 1);
  assert.equal(candidate.error, 'UNEXPECTED_EVENT_OR_TOOL');
  await verifyCodexCandidate(root, candidate);
});
test('auth failure makes no inference attempt and remains private operational evidence', async () => {
  let calls = 0;
  const opts = await options({
    executor: async (binary, args, params) => {
      if (args[0] === 'exec') calls++;
      return args[0] === 'login'
        ? capture('', 'Logged in using an API key')
        : fixture(binary, args, params);
    },
  });
  const { candidate } = await runCodexPilot(opts);
  assert.equal(candidate.error, 'CHATGPT_LOGIN_REQUIRED');
  assert.equal(calls, 0);
  await verifyCodexCandidate(root, candidate);
});
test('kill switch between cases stops without refunding the receipt', async () => {
  let kill = '0';
  const opts = await options({
    killSwitch: () => kill,
    executor: async (...params) => {
      const result = await fixture(...params);
      if (params[1][0] === 'exec') kill = '1';
      return result;
    },
  });
  const { candidate } = await runCodexPilot(opts);
  assert.equal(candidate.error, 'KILL_SWITCH');
  assert.equal(candidate.trials.length, 1);
  await verifyCodexCandidate(root, candidate);
});
test('binary mismatch rejects before executor or receipt', async () => {
  const opts = await options();
  opts.approval.binarySha256 = '0'.repeat(64);
  await assert.rejects(runCodexPilot(opts), /CLI_BINARY_CHANGED/);
  assert.deepEqual(await readdir(opts.privateDir), []);
});
test('fixture executors cannot be labeled LIVE', async () => {
  await assert.rejects(
    runCodexPilot(await options({ mode: 'LIVE' })),
    /INVALID_MODE/,
  );
});
test('verification detects prompt, score, identity, chronology, raw and completion tampering', async () => {
  const { candidate } = await runCodexPilot(await options());
  for (const tamper of [
    (c) => {
      c.trials[0].prompt += 'changed';
    },
    (c) => {
      c.trials[0].analysis.verdict = 'MISMATCH';
    },
    (c) => {
      c.trials[0].capture.stdout += 'changed';
    },
    (c) => {
      c.requestedModel = 'gpt-5.5';
    },
    (c) => {
      c.returnedModel = c.requestedModel;
    },
    (c) => {
      c.trials[0].finishedAt = '2026-09-04T00:00:00Z';
    },
    (c) => {
      c.trials.pop();
    },
    (c) => {
      c.preflight.arguments.push('--dangerously-bypass-approvals-and-sandbox');
    },
  ]) {
    const changed = structuredClone(candidate);
    tamper(changed);
    await assert.rejects(verifyCodexCandidate(root, changed));
  }
});
test('default CLI plans offline, accepts no live shorthand, and refuses live CI', () => {
  const entry = path.join(root, 'scripts/probes/codex-cli.mjs');
  const plan = spawnSync(process.execPath, [entry], { encoding: 'utf8' });
  assert.equal(plan.status, 0);
  assert.equal(JSON.parse(plan.stdout).mode, 'PLAN_ONLY_NO_NETWORK');
  assert.equal(
    spawnSync(process.execPath, [entry, '--live'], { encoding: 'utf8' }).status,
    1,
  );
  const ci = spawnSync(
    process.execPath,
    [entry, '--live', '--approval', 'missing', '--binary', binary],
    { encoding: 'utf8', env: { ...process.env, CI: 'true' } },
  );
  assert.match(ci.stderr, /MANUAL_ONLY_NO_CI/);
});
test('process adapter captures only local fixture output without a shell or model', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'etm-codex-process-'));
  const result = await executeCodexProcess(
    process.execPath,
    [
      '-e',
      'process.stdin.resume(); process.stdin.on("end", () => console.log("fixture"))',
    ],
    { directory },
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), 'fixture');
});
test('process adapter terminates a timed-out local fixture', async () => {
  const started = performance.now();
  const directory = await mkdtemp(path.join(tmpdir(), 'etm-codex-timeout-'));
  const result = await executeCodexProcess(
    process.execPath,
    ['-e', 'setInterval(() => {}, 1000)'],
    { directory, timeoutMs: 200 },
  );
  assert.equal(result.error, 'PROCESS_TIMEOUT');
  assert.ok(performance.now() - started < 5000, 'timeout termination must be bounded');
});
