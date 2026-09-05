import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  readFile,
  mkdir,
  mkdtemp,
  writeFile,
  realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { makeCases, sha256 } from './protocol.mjs';
import {
  codexProtocol as protocol,
  answerSchema,
  codexArgs,
  codexPrompt,
  childEnvironment,
  capture,
  analyze,
  allowedEvent,
} from './codex-protocol.mjs';

const files = [
  'scripts/probes/protocol.mjs',
  'scripts/probes/codex-protocol.mjs',
  'scripts/probes/codex-runner.mjs',
  'scripts/probes/codex-cli.mjs',
  'schemas/codex-pilot-approval.schema.json',
  'schemas/codex-pilot-candidate.schema.json',
];
export async function codexImplementationHash(root) {
  return sha256(
    JSON.stringify(
      await Promise.all(
        files.map(async (file) => [
          file,
          sha256(
            (await readFile(path.join(root, file), 'utf8')).replaceAll(
              '\r\n',
              '\n',
            ),
          ),
        ]),
      ),
    ),
  );
}
export async function binaryHash(binary) {
  if (
    !path.isAbsolute(binary) ||
    (process.platform === 'win32' &&
      path.extname(binary).toLowerCase() !== '.exe')
  )
    throw new Error('ABSOLUTE_NATIVE_BINARY_REQUIRED');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(binary)) hash.update(chunk);
  return hash.digest('hex');
}
export function safeCodexError(error) {
  return /^[A-Z][A-Z0-9_]{0,79}$/.test(error?.message ?? '')
    ? error.message
    : 'CODEX_LOCAL_ERROR';
}
async function schema(root, name, value) {
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(
    JSON.parse(
      await readFile(
        path.join(root, `schemas/codex-pilot-${name}.schema.json`),
        'utf8',
      ),
    ),
  );
  if (!validate(value)) throw new Error('INVALID_CODEX_SCHEMA');
}
export async function checkCodexApproval(root, approval, time, kill) {
  if (kill === '1') throw new Error('KILL_SWITCH');
  await schema(root, 'approval', approval);
  const now = Date.parse(time),
    issued = Date.parse(approval.issuedAt),
    expires = Date.parse(approval.expiresAt);
  if (
    !Number.isFinite(now) ||
    issued > now ||
    expires <= now ||
    expires <= issued ||
    expires - issued > 86400000
  )
    throw new Error('APPROVAL_EXPIRED_OR_INVALID');
  if (approval.implementationSha256 !== (await codexImplementationHash(root)))
    throw new Error('IMPLEMENTATION_CHANGED');
}

// The CLI, not a shell, receives the prompt through stdin. Only a minimal OS
// environment is inherited. No .env loading, key copying, or auth-file reading.
export function executeCodexProcess(binary, args, options) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(binary, args, {
        cwd: options.directory,
        env: childEnvironment(process.env),
        windowsHide: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      resolve(capture('', '', null, 'PROCESS_START_FAILED'));
      return;
    }
    let stdout = '',
      stderr = '',
      pending = '',
      bytes = 0,
      error = null;
    const stop = (reason) => {
      if (error) return;
      error = reason;
      if (child.pid && process.platform === 'win32') {
        // Kill exactly this known child and its descendants, never by image name.
        const killer = spawn(
          'taskkill.exe',
          ['/PID', String(child.pid), '/T', '/F'],
          { windowsHide: true, stdio: 'ignore' },
        );
        killer.on('error', () => child.kill());
        killer.on('close', (code) => {
          if (code !== 0) child.kill('SIGKILL');
        });
      } else child.kill('SIGKILL');
    };
    const timer = setTimeout(
      () => stop('PROCESS_TIMEOUT'),
      options.timeoutMs ?? protocol.timeoutMs,
    );
    const killed = setInterval(() => {
      if (options.killSwitch?.() === '1') stop('KILL_SWITCH');
    }, 200);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    const append = (text, isOut) => {
      bytes += Buffer.byteLength(text);
      if (bytes > protocol.maxCaptureBytes) {
        stop('CAPTURE_LIMIT_EXCEEDED');
        return;
      }
      if (isOut) stdout += text;
      else stderr += text;
      if (!isOut || !options.events || error) return;
      pending += text;
      while (pending.includes('\n')) {
        const end = pending.indexOf('\n'),
          line = pending.slice(0, end).trim();
        pending = pending.slice(end + 1);
        if (!line) continue;
        try {
          if (!allowedEvent(JSON.parse(line))) stop('UNEXPECTED_EVENT_OR_TOOL');
        } catch {
          stop('INVALID_EVENT_STREAM');
        }
      }
    };
    child.stdout.on('data', (text) => append(text, true));
    child.stderr.on('data', (text) => append(text, false));
    child.on('error', () => {
      error ??= 'PROCESS_START_FAILED';
    });
    child.stdin.on('error', () => {
      /* early child exit, captured by close */
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      clearInterval(killed);
      resolve(capture(stdout, stderr, code, error));
    });
    child.stdin.end(options.prompt ?? '');
  });
}

export async function runCodexPilot({
  root,
  approval,
  binary,
  mode = 'LIVE',
  executor = executeCodexProcess,
  privateDir = path.join(root, '.probes', 'codex'),
  now = () => new Date().toISOString(),
  killSwitch = () => process.env.ETM_PROBES_KILL_SWITCH,
}) {
  if (
    !['LIVE', 'FIXTURE'].includes(mode) ||
    (mode === 'LIVE' && executor !== executeCodexProcess)
  )
    throw new Error('INVALID_MODE');
  if (mode === 'LIVE' && process.env.CI) throw new Error('MANUAL_ONLY_NO_CI');
  if (
    mode === 'LIVE' &&
    path.resolve(privateDir) !== path.resolve(root, '.probes', 'codex')
  )
    throw new Error('PRIVATE_DIRECTORY_REQUIRED');
  await checkCodexApproval(root, approval, now(), killSwitch());
  if ((await binaryHash(binary)) !== approval.binarySha256)
    throw new Error('CLI_BINARY_CHANGED');
  await mkdir(privateDir, { recursive: true });
  if (
    mode === 'LIVE' &&
    !(await realpath(privateDir)).startsWith((await realpath(root)) + path.sep)
  )
    throw new Error('PRIVATE_DIRECTORY_REQUIRED');
  // Global to this checkout/surface, not per approval ID. Never automatically
  // removed, refunded or rotated, even on unknown spend or a preflight failure.
  await writeFile(
    path.join(privateDir, 'manual-run.lock'),
    JSON.stringify({ approval, consumedAt: now() }),
    { flag: 'wx', mode: 0o600 },
  );
  const directory = path.join(privateDir, approval.id);
  await mkdir(directory);
  const save = (name, value) =>
    writeFile(
      path.join(directory, name),
      JSON.stringify(value, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
  const candidate = {
    schemaVersion: '1.0.0',
    protocol: protocol.id,
    surface: protocol.surface,
    mode,
    reviewStatus: 'PENDING_REVIEW',
    approval,
    implementationSha256: approval.implementationSha256,
    requestedModel: approval.model,
    returnedModel: null,
    billing: {
      channel: 'CHATGPT_WORKSPACE',
      costUsd: null,
      creditsCharged: null,
      monetaryCapEnforced: false,
    },
    startedAt: now(),
    finishedAt: now(),
    status: 'ABORTED',
    error: null,
    preflight: null,
    trials: [],
  };
  try {
    const workspace = await mkdtemp(path.join(tmpdir(), 'etm-codex-manual-'));
    // Output constraint is the only harness-authored content near the empty cwd.
    const schemaPath = path.join(workspace, 'answer.schema.json');
    await writeFile(schemaPath, JSON.stringify(answerSchema), {
      flag: 'wx',
      mode: 0o600,
    });
    const version = await executor(binary, ['--version'], {
      directory: workspace,
      timeoutMs: 10000,
      killSwitch,
    });
    const auth = await executor(binary, ['login', 'status'], {
      directory: workspace,
      timeoutMs: 10000,
      killSwitch,
    });
    candidate.preflight = {
      version,
      auth,
      arguments: codexArgs(
        approval.model,
        '<EMPTY_WORKDIR>',
        '<ANSWER_SCHEMA>',
      ),
    };
    await save('preflight.json', candidate.preflight);
    if (
      version.error ||
      version.exitCode !== 0 ||
      version.stdout.trim() !== approval.cliVersion
    )
      throw new Error('CLI_VERSION_MISMATCH');
    if (
      auth.error ||
      auth.exitCode !== 0 ||
      (auth.stdout + auth.stderr).trim() !== 'Logged in using ChatGPT'
    )
      throw new Error('CHATGPT_LOGIN_REQUIRED');
    for (const testCase of makeCases(candidate.startedAt)) {
      await checkCodexApproval(root, approval, now(), killSwitch());
      if ((await binaryHash(binary)) !== approval.binarySha256)
        throw new Error('CLI_BINARY_CHANGED');
      const trial = {
        testCase,
        prompt: codexPrompt(testCase),
        startedAt: now(),
        finishedAt: now(),
        capture: null,
        analysis: analyze(testCase, null),
      };
      await save(`${testCase.id}-request.json`, {
        testCase,
        prompt: trial.prompt,
        startedAt: trial.startedAt,
      });
      candidate.trials.push(trial);
      try {
        trial.capture = await executor(
          binary,
          codexArgs(approval.model, workspace, schemaPath),
          {
            directory: workspace,
            prompt: trial.prompt,
            events: true,
            killSwitch,
          },
        );
        trial.analysis = analyze(testCase, trial.capture);
        if (trial.analysis.error) throw new Error(trial.analysis.error);
      } finally {
        trial.finishedAt = now();
        await save(`${testCase.id}-result.json`, trial);
      }
    }
    candidate.status = 'COMPLETED';
  } catch (error) {
    candidate.error = safeCodexError(error);
  }
  candidate.finishedAt = now();
  await schema(root, 'candidate', candidate);
  await save('candidate.json', candidate);
  return { candidate, directory };
}

export async function verifyCodexCandidate(root, candidate) {
  await schema(root, 'candidate', candidate);
  await checkCodexApproval(root, candidate.approval, candidate.startedAt);
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (
    candidate.implementationSha256 !==
      candidate.approval.implementationSha256 ||
    candidate.requestedModel !== candidate.approval.model
  )
    throw new Error('IDENTITY_MISMATCH');
  const checkCapture = (value) => {
    if (
      !value ||
      typeof value.stdout !== 'string' ||
      typeof value.stderr !== 'string' ||
      Buffer.byteLength(value.stdout + value.stderr) >
        protocol.maxCaptureBytes ||
      value.sha256 !== sha256(JSON.stringify([value.stdout, value.stderr])) ||
      ![true, false].includes(value.redacted) ||
      !(value.exitCode === null || Number.isInteger(value.exitCode)) ||
      !(value.error === null || /^[A-Z][A-Z0-9_]{0,79}$/.test(value.error))
    )
      throw new Error('INVALID_CAPTURE');
  };
  const pre = candidate.preflight;
  if (pre) {
    checkCapture(pre.version);
    checkCapture(pre.auth);
    if (
      !equal(
        pre.arguments,
        codexArgs(
          candidate.requestedModel,
          '<EMPTY_WORKDIR>',
          '<ANSWER_SCHEMA>',
        ),
      )
    )
      throw new Error('ARGUMENTS_CHANGED');
  }
  if (
    candidate.trials.length &&
    (!pre ||
      pre.version.error ||
      pre.auth.error ||
      pre.version.exitCode !== 0 ||
      pre.auth.exitCode !== 0 ||
      pre.version.stdout.trim() !== candidate.approval.cliVersion ||
      (pre.auth.stdout + pre.auth.stderr).trim() !== 'Logged in using ChatGPT')
  )
    throw new Error('INVALID_PREFLIGHT');
  let last = Date.parse(candidate.startedAt),
    failure = null;
  const cases = makeCases(candidate.startedAt);
  for (const [index, trial] of candidate.trials.entries()) {
    if (
      failure ||
      !equal(trial.testCase, cases[index]) ||
      trial.prompt !== codexPrompt(cases[index])
    )
      throw new Error('TRIAL_SEQUENCE_MISMATCH');
    await checkCodexApproval(root, candidate.approval, trial.startedAt);
    if (
      Date.parse(trial.startedAt) < last ||
      Date.parse(trial.finishedAt) < Date.parse(trial.startedAt)
    )
      throw new Error('INVALID_CHRONOLOGY');
    last = Date.parse(trial.finishedAt);
    if (trial.capture) checkCapture(trial.capture);
    const replay = analyze(trial.testCase, trial.capture);
    if (!equal(replay, trial.analysis)) throw new Error('ANALYSIS_MISMATCH');
    failure = replay.error;
  }
  if (Date.parse(candidate.finishedAt) < last)
    throw new Error('INVALID_CHRONOLOGY');
  if (
    candidate.status === 'COMPLETED'
      ? candidate.trials.length !== protocol.maxInvocations ||
        failure ||
        candidate.error !== null
      : !candidate.error ||
        (failure && failure !== candidate.error && failure !== 'NO_CAPTURE')
  )
    throw new Error('INVALID_COMPLETION');
  return true; // Hash consistency, not authentication of provider origin or billing.
}
