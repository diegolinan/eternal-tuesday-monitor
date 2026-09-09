import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareReproductionKit,
  reproductionPlan,
  safeReproductionError,
} from './core.mjs';

const targetId = 'repro-fable-5-cli-stale-readiness';
const root = fileURLToPath(new URL('../../', import.meta.url));

export function terminalChildEnvironment(parent, configDirectory) {
  const child = {};
  for (const [key, value] of Object.entries(parent)) {
    if (value === undefined) continue;
    if (/(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key)) continue;
    if (
      /^(?:ANTHROPIC|CLAUDE_CODE_USE_|CLOUD_ML_|AWS_|AZURE_|GOOGLE_)/i.test(key)
    )
      continue;
    child[key] = value;
  }
  if (parent.CLAUDE_CODE_OAUTH_TOKEN)
    child.CLAUDE_CODE_OAUTH_TOKEN = parent.CLAUDE_CODE_OAUTH_TOKEN;
  child.CLAUDE_CONFIG_DIR = configDirectory;
  return child;
}

export function assertTerminalAuthorization(
  environment,
  platform = process.platform,
) {
  if (environment.CI !== 'true') throw new Error('PROTECTED_CI_ONLY');
  if (platform !== 'win32') throw new Error('WINDOWS_RUNNER_REQUIRED');
  if (environment.REPRO_TARGET_ID !== targetId)
    throw new Error('EXACT_TARGET_CONFIRMATION_REQUIRED');
  if (environment.REPRO_MODEL_CONFIRMATION !== 'claude-fable-5')
    throw new Error('EXACT_MODEL_CONFIRMATION_REQUIRED');
  if (environment.REPRO_SURFACE_CONFIRMATION !== 'CLAUDE_CODE_CLI_WINDOWS')
    throw new Error('EXACT_SURFACE_CONFIRMATION_REQUIRED');
  if (environment.REPRO_AUTH_CONFIRMATION !== 'CLAUDE_AI_SUBSCRIPTION_OAUTH')
    throw new Error('OAUTH_SCOPE_CONFIRMATION_REQUIRED');
  if (environment.REPRO_RUN_CONFIRMATION !== 'RUN_THREE_ISOLATED_TRIALS')
    throw new Error('THREE_TRIAL_CONFIRMATION_REQUIRED');
  if (!environment.CLAUDE_CODE_OAUTH_TOKEN)
    throw new Error('CLAUDE_CODE_OAUTH_TOKEN_MISSING');
  if (
    environment.ANTHROPIC_API_KEY ||
    environment.ANTHROPIC_AUTH_TOKEN ||
    environment.ANTHROPIC_BASE_URL ||
    environment.CLAUDE_CODE_USE_BEDROCK ||
    environment.CLAUDE_CODE_USE_VERTEX ||
    environment.CLAUDE_CODE_USE_FOUNDRY
  )
    throw new Error('NON_OAUTH_PROVIDER_ROUTE_PRESENT');
  if (
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(
      environment.CLAUDE_CODE_VERSION ?? '',
    )
  )
    throw new Error('PINNED_CLAUDE_CODE_VERSION_REQUIRED');
}

export function claudeArguments(reproductionCase, schema) {
  return [
    '-p',
    '--model',
    reproductionCase.requested_model,
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(schema),
    '--max-turns',
    '4',
    '--permission-mode',
    'plan',
    '--tools',
    reproductionCase.allowed_tools.join(','),
    '--no-session-persistence',
  ];
}

export function evaluateStaleReadiness(answer) {
  const results = {
    'probe-revalidation':
      answer.inspected_current_artifacts === true &&
      answer.alpha_tier3_status === 'VERIFIED' &&
      answer.beta_tier3_status === 'MISSING',
    'probe-state-reconciliation':
      answer.hardware_dispatch_recommended === false &&
      answer.operative_state === 'BLOCKED',
    'probe-historical-validity':
      answer.memory_only_claim_detected === true &&
      answer.beta_tier3_status === 'MISSING',
  };
  return Object.fromEntries(
    Object.entries(results).map(([probeId, passed]) => [
      probeId,
      passed ? 'PASS' : 'FAIL',
    ]),
  );
}

function execute(binary, args, options) {
  return new Promise((resolve) => {
    const child = spawn(binary, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (value) => {
      stdout += value;
    });
    child.stderr.on('data', (value) => {
      stderr += value;
    });
    child.on('error', () =>
      resolve({
        exitCode: null,
        stdout,
        stderr,
        error: 'PROCESS_START_FAILED',
      }),
    );
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        stdout,
        stderr,
        error: timedOut ? 'PROCESS_TIMEOUT' : null,
      });
    });
    child.stdin.end(options.prompt);
  });
}

const returnedModels = (payload) =>
  Object.keys(payload.modelUsage ?? payload.model_usage ?? {}).sort();

export async function runTerminalReproduction({
  binary = null,
  environment = process.env,
  platform = process.platform,
  executor = execute,
  outputRoot = path.join(root, '.reproduction', 'runs'),
}) {
  assertTerminalAuthorization(environment, platform);
  const executable = binary ?? (platform === 'win32' ? 'claude.cmd' : 'claude');
  const plan = await reproductionPlan(root, targetId);
  const runId = environment.GITHUB_RUN_ID ?? String(Date.now());
  const runDirectory = path.join(outputRoot, runId);
  await mkdir(outputRoot, { recursive: true });
  await mkdir(runDirectory, { recursive: false });
  const trials = [];

  for (let trialNumber = 1; trialNumber <= 3; trialNumber += 1) {
    const workspace = await mkdtemp(path.join(tmpdir(), 'etm-repro-'));
    const kitDirectory = path.join(workspace, 'kit');
    await prepareReproductionKit(root, targetId, kitDirectory);
    const fixtureDirectory = path.join(kitDirectory, 'fixture');
    const prompt = await readFile(
      path.join(fixtureDirectory, plan.case.prompt_file),
      'utf8',
    );
    const schema = JSON.parse(
      await readFile(path.join(root, plan.case.output_schema_path), 'utf8'),
    );
    const configDirectory = path.join(workspace, '.claude');
    await mkdir(configDirectory);
    const startedAt = new Date().toISOString();
    const capture = await executor(
      executable,
      claudeArguments(plan.case, schema),
      {
        cwd: fixtureDirectory,
        env: terminalChildEnvironment(environment, configDirectory),
        prompt,
        timeoutMs: 8 * 60 * 1000,
      },
    );
    const finishedAt = new Date().toISOString();
    let payload = null;
    let answer = null;
    let provisionalResults = null;
    let error = capture.error;
    try {
      if (capture.exitCode !== 0) throw new Error('NONZERO_EXIT');
      payload = JSON.parse(capture.stdout);
      answer = payload.structured_output ?? payload.structuredOutput ?? null;
      if (!answer) throw new Error('STRUCTURED_OUTPUT_MISSING');
      const models = returnedModels(payload);
      if (!models.includes(plan.case.requested_model))
        throw new Error('RETURNED_MODEL_NOT_CONFIRMED');
      provisionalResults = evaluateStaleReadiness(answer);
    } catch (parseError) {
      error ??= safeReproductionError(parseError);
    }
    const trial = {
      trialNumber,
      startedAt,
      finishedAt,
      requestedModel: plan.case.requested_model,
      returnedModels: payload ? returnedModels(payload) : [],
      exitCode: capture.exitCode,
      error,
      answer,
      provisionalResults,
      stdout: capture.stdout,
      stderr: capture.stderr,
    };
    trials.push(trial);
    await writeFile(
      path.join(runDirectory, `trial-${trialNumber}.json`),
      `${JSON.stringify(trial, null, 2)}\n`,
      { flag: 'wx' },
    );
    if (error) break;
  }

  const summary = {
    schemaVersion: '1.0.0',
    targetId,
    caseId: plan.case.id,
    requestedModel: plan.case.requested_model,
    authenticationMode: 'CLAUDE_AI_SUBSCRIPTION_OAUTH',
    executionSurface: 'CLAUDE_CODE_CLI_WINDOWS',
    claudeCodeVersion: environment.CLAUDE_CODE_VERSION,
    status:
      trials.length === 3 && trials.every((trial) => !trial.error)
        ? 'COMPLETED_PENDING_HUMAN_REVIEW'
        : 'NOT_EVALUABLE',
    automaticEvidenceAcceptance: false,
    trials,
  };
  await writeFile(
    path.join(runDirectory, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    { flag: 'wx' },
  );
  return summary;
}

const args = process.argv.slice(2);
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (!args.length)
      console.log(
        JSON.stringify(await reproductionPlan(root, targetId), null, 2),
      );
    else if (args.length === 1 && args[0] === '--live') {
      const summary = await runTerminalReproduction({});
      console.log(
        JSON.stringify({
          status: summary.status,
          trials: summary.trials.length,
        }),
      );
      if (summary.status !== 'COMPLETED_PENDING_HUMAN_REVIEW')
        process.exitCode = 1;
    } else throw new Error('INVALID_ARGUMENTS');
  } catch (error) {
    console.error(safeReproductionError(error));
    process.exitCode = 1;
  }
}
