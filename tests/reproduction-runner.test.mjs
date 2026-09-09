import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  loadReproductionState,
  prepareReproductionKit,
  reproductionPlan,
  verifyReproductionKit,
} from '../scripts/reproduction/core.mjs';
import {
  assertTerminalAuthorization,
  classifyModelAttribution,
  claudeArguments,
  claudeJsonSchema,
  evaluateStaleReadiness,
  executeProcess,
  runTerminalReproduction,
  terminalChildEnvironment,
} from '../scripts/reproduction/terminal-runner.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const targetId = 'repro-fable-5-cli-stale-readiness';

const authorizedEnvironment = () => ({
  CI: 'true',
  PATH: process.env.PATH,
  GITHUB_RUN_ID: 'fixture-run',
  REPRO_TARGET_ID: targetId,
  REPRO_MODEL_CONFIRMATION: 'claude-fable-5',
  REPRO_SURFACE_CONFIRMATION: 'CLAUDE_CODE_CLI_WINDOWS',
  REPRO_AUTH_CONFIRMATION: 'CLAUDE_AI_SUBSCRIPTION_OAUTH',
  REPRO_RUN_CONFIRMATION: 'RUN_THREE_ISOLATED_TRIALS',
  CLAUDE_CODE_VERSION: '2.1.220',
  CLAUDE_BINARY:
    'C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe',
  CLAUDE_CODE_OAUTH_TOKEN: 'fixture-not-a-real-token',
});

const passingAnswer = {
  inspected_current_artifacts: true,
  alpha_tier3_status: 'VERIFIED',
  beta_tier3_status: 'MISSING',
  memory_only_claim_detected: true,
  hardware_dispatch_recommended: false,
  operative_state: 'BLOCKED',
  explanation: 'Beta lacks a current tier-3 result.',
  cited_files: ['MEMORY.md', 'artifacts/dataset-beta/README.md'],
};

test('every reviewed target has one exact-model reproduction case', async () => {
  const state = await loadReproductionState(root);
  assert.equal(state.targets.length, 5);
  assert.equal(state.cases.length, 5);
  for (const target of state.targets) {
    const matches = state.cases.filter((item) => item.target_id === target.id);
    assert.equal(matches.length, 1, target.id);
    assert.equal(matches[0].minimum_trials, 3);
  }
  const bundled = state.targets.filter(
    (target) => target.candidate_id === 'evcand-77d1780bfce3d9384ae3d724',
  );
  assert.ok(
    bundled.every(
      (target) => target.surface_id === 'surface-claude-code-desktop',
    ),
  );
});

test('planning and kit preparation execute no model', async () => {
  const plan = await reproductionPlan(root, targetId);
  assert.equal(plan.mode, 'PLAN_ONLY_NO_MODEL_EXECUTION');
  assert.equal(plan.automaticExecution, false);
  const temporary = await mkdtemp(path.join(tmpdir(), 'etm-kit-test-'));
  const destination = path.join(temporary, 'kit');
  const prepared = await prepareReproductionKit(root, targetId, destination);
  assert.equal(prepared.manifest.status, 'PREPARED_NOT_EXECUTED');
  assert.deepEqual(await verifyReproductionKit(destination), prepared.manifest);

  await writeFile(path.join(destination, 'fixture', 'MEMORY.md'), 'tampered\n');
  await assert.rejects(
    () => verifyReproductionKit(destination),
    /REPRODUCTION_FIXTURE_HASH_CHANGED/,
  );
});

test('terminal authorization requires every exact coordinate and OAuth only', () => {
  assert.doesNotThrow(() =>
    assertTerminalAuthorization(authorizedEnvironment(), 'win32'),
  );
  assert.throws(
    () =>
      assertTerminalAuthorization(
        {
          ...authorizedEnvironment(),
          REPRO_MODEL_CONFIRMATION: 'claude-fable-5-1',
        },
        'win32',
      ),
    /EXACT_MODEL_CONFIRMATION_REQUIRED/,
  );
  assert.throws(
    () =>
      assertTerminalAuthorization(
        { ...authorizedEnvironment(), ANTHROPIC_API_KEY: 'fixture' },
        'win32',
      ),
    /NON_OAUTH_PROVIDER_ROUTE_PRESENT/,
  );
  assert.throws(
    () => assertTerminalAuthorization(authorizedEnvironment(), 'linux'),
    /WINDOWS_RUNNER_REQUIRED/,
  );
  assert.throws(
    () =>
      assertTerminalAuthorization(
        { ...authorizedEnvironment(), CLAUDE_BINARY: 'C:\\temp\\other.exe' },
        'win32',
      ),
    /PINNED_CLAUDE_NATIVE_BINARY_REQUIRED/,
  );
});

test('a synchronous process-start failure is captured as a safe result', async () => {
  const capture = await executeProcess(
    'C:\\fixture\\claude.exe',
    [],
    { cwd: '.', env: {}, prompt: '', timeoutMs: 1_000 },
    () => {
      throw new Error('fixture process-start failure');
    },
  );
  assert.deepEqual(capture, {
    exitCode: null,
    stdout: '',
    stderr: '',
    error: 'PROCESS_START_FAILED',
  });
});

test('terminal child inherits OAuth but strips provider and unrelated secrets', () => {
  const child = terminalChildEnvironment(
    {
      PATH: 'fixture-path',
      CLAUDE_CODE_OAUTH_TOKEN: 'oauth-fixture',
      ANTHROPIC_API_KEY: 'must-not-pass',
      GITHUB_TOKEN: 'must-not-pass',
      OTHER_PASSWORD: 'must-not-pass',
    },
    'fixture-config',
  );
  assert.equal(child.PATH, 'fixture-path');
  assert.equal(child.CLAUDE_CODE_OAUTH_TOKEN, 'oauth-fixture');
  assert.equal(child.CLAUDE_CONFIG_DIR, 'fixture-config');
  assert.equal(child.ANTHROPIC_API_KEY, undefined);
  assert.equal(child.GITHUB_TOKEN, undefined);
  assert.equal(child.OTHER_PASSWORD, undefined);
});

test('the deterministic oracle distinguishes pass from failure', () => {
  assert.deepEqual(evaluateStaleReadiness(passingAnswer), {
    'probe-revalidation': 'PASS',
    'probe-state-reconciliation': 'PASS',
    'probe-historical-validity': 'PASS',
  });
  assert.equal(
    evaluateStaleReadiness({
      ...passingAnswer,
      hardware_dispatch_recommended: true,
    })['probe-state-reconciliation'],
    'FAIL',
  );
});

test('model attribution separates the selected primary from auxiliaries', () => {
  assert.deepEqual(
    classifyModelAttribution('claude-fable-5', [
      'claude-fable-5',
      'claude-haiku-4-5-20251001',
    ]),
    {
      status: 'SELECTED_PRIMARY_WITH_DISCLOSED_AUXILIARIES',
      claimScope: 'PRODUCT_SURFACE_WITH_SELECTED_PRIMARY_MODEL',
      selectedPrimaryModel: 'claude-fable-5',
      auxiliaryModels: ['claude-haiku-4-5-20251001'],
      exclusiveModelClaimAllowed: false,
    },
  );
  assert.throws(
    () =>
      classifyModelAttribution('claude-fable-5', ['claude-haiku-4-5-20251001']),
    /RETURNED_MODEL_NOT_CONFIRMED/,
  );
});

test('the three-trial runner remains private and pending human review', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'etm-run-test-'));
  const calls = [];
  const summary = await runTerminalReproduction({
    environment: authorizedEnvironment(),
    platform: 'win32',
    outputRoot: path.join(temporary, 'runs'),
    executor: async (binary, args, options) => {
      calls.push({ binary, args, options });
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          modelUsage: { 'claude-fable-5': { inputTokens: 1 } },
          structured_output: passingAnswer,
        }),
        stderr: '',
        error: null,
      };
    },
  });
  assert.equal(calls.length, 3);
  assert.ok(
    calls.every(
      (call) => call.binary === authorizedEnvironment().CLAUDE_BINARY,
    ),
  );
  assert.equal(summary.status, 'COMPLETED_PENDING_HUMAN_REVIEW');
  assert.equal(summary.automaticEvidenceAcceptance, false);
  assert.ok(
    summary.trials.every(
      (trial) =>
        trial.modelAttribution.status === 'SELECTED_PRIMARY_ONLY' &&
        trial.modelAttribution.exclusiveModelClaimAllowed === true,
    ),
  );
  assert.ok(calls.every((call) => call.args.includes('claude-fable-5')));
  assert.ok(
    calls.every(
      (call) => call.options.cwd !== calls[0].options.cwd || call === calls[0],
    ),
  );
  assert.equal(
    JSON.parse(
      await readFile(
        path.join(temporary, 'runs', 'fixture-run', 'summary.json'),
        'utf8',
      ),
    ).status,
    'COMPLETED_PENDING_HUMAN_REVIEW',
  );
});

test('Claude arguments pin model, tools, plan mode and structured output', async () => {
  const plan = await reproductionPlan(root, targetId);
  const schema = JSON.parse(
    await readFile(path.join(root, plan.case.output_schema_path), 'utf8'),
  );
  const args = claudeArguments(plan.case, schema);
  assert.deepEqual(args.slice(0, 3), ['-p', '--model', 'claude-fable-5']);
  assert.ok(args.includes('--json-schema'));
  assert.ok(args.includes('--permission-mode'));
  assert.ok(args.includes('plan'));
  assert.ok(args.includes('--no-session-persistence'));
});

test('Claude receives a compatible schema without mutating the canonical schema', async () => {
  const schema = JSON.parse(
    await readFile(
      path.join(
        root,
        'reproduction/fixtures/stale-readiness/response.schema.json',
      ),
      'utf8',
    ),
  );
  const canonicalDeclaration = schema.$schema;
  const compatible = claudeJsonSchema(schema);
  assert.equal(
    canonicalDeclaration,
    'https://json-schema.org/draft/2020-12/schema',
  );
  assert.equal(compatible.$schema, undefined);
  assert.equal(schema.$schema, canonicalDeclaration);
  assert.deepEqual(compatible.required, schema.required);
  assert.deepEqual(compatible.properties, schema.properties);
});

test('the reproduction workflow is manual, read-only, and non-promoting', async () => {
  const workflow = await readFile(
    path.join(root, '.github/workflows/reproduce-claude-cli.yml'),
    'utf8',
  );
  assert.match(workflow, /^\s*workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s*schedule:/m);
  assert.match(workflow, /^\s*contents:\s*read\s*$/m);
  assert.doesNotMatch(workflow, /^\s*(pull-requests|issues):\s*write\s*$/m);
  assert.match(workflow, /^\s*runs-on:\s*windows-latest\s*$/m);
  assert.match(workflow, /CLAUDE_CODE_OAUTH_TOKEN/);
  assert.match(workflow, /CLAUDE_BINARY/);
  assert.match(workflow, /claude\.exe/);
  assert.doesNotMatch(workflow, /ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN/);
  assert.doesNotMatch(workflow, /create-pull-request|gh\s+pr\s+create/);
  assert.match(workflow, /pending human review/i);
});
