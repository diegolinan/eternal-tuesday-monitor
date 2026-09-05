import { expectedAnswer, sha256 } from './time-cases.mjs';

export const codexProtocol = Object.freeze({
  id: 'codex-cli-explicit-offset-manual-1',
  surface: 'experimental-codex-cli-chatgpt-local',
  maxInvocations: 3,
  timeoutMs: 60000,
  maxCaptureBytes: 262144,
  stopAfterInputTokens: 32000,
  stopAfterOutputTokens: 512,
  monetaryCapEnforced: false,
});

export const answerSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['date', 'weekday'],
  properties: { date: { type: 'string' }, weekday: { type: 'string' } },
};

export function codexPrompt(testCase) {
  expectedAnswer(testCase.referenceUtc, testCase.offsetHours);
  return `Use only the supplied reference instant and fixed UTC offset. Do not use tools, read files, access the network, inspect your environment, or use an independent clock. This is a supplied-context calendar calculation, not a request to discover the current time. Reference instant: ${testCase.referenceUtc}. Fixed UTC offset: ${testCase.offsetHours} hours. Return only a JSON object with exactly date (YYYY-MM-DD) and weekday (full English weekday name) at that instant.`;
}

// No shell interpolation, no resume, no project context or user config. Managed
// policy and built-in context still apply; this is NOT a bare model API request.
export function codexArgs(model, directory, schemaPath) {
  return [
    'exec',
    '--ignore-user-config',
    '--strict-config',
    '--ephemeral',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--color',
    'never',
    '--json',
    '--model',
    model,
    '-C',
    directory,
    '--output-schema',
    schemaPath,
    ...[
      'forced_login_method="chatgpt"',
      'model_provider="openai"',
      'model_reasoning_effort="low"',
      'web_search="disabled"',
      'features.shell_tool=false',
      'features.shell_snapshot=false',
      'features.apps=false',
      'features.remote_plugin=false',
      'features.multi_agent=false',
      'features.hooks=false',
      'features.memories=false',
      'features.goals=false',
      'features.skill_mcp_dependency_install=false',
    ].flatMap((setting) => ['-c', setting]),
    '-',
  ];
}

export function childEnvironment(source) {
  const allowed = new Set([
    'PATH',
    'SYSTEMROOT',
    'WINDIR',
    'COMSPEC',
    'PATHEXT',
    'USERPROFILE',
    'HOMEDRIVE',
    'HOMEPATH',
    'HOME',
    'APPDATA',
    'LOCALAPPDATA',
    'TEMP',
    'TMP',
    'CODEX_HOME',
  ]);
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => allowed.has(key.toUpperCase())),
  );
}

export function redact(text) {
  return text
    .replace(/\bsk-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/Bearer\s+[^\s"\\]+/gi, 'Bearer [REDACTED]')
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      '[REDACTED]',
    );
}

export function capture(stdout = '', stderr = '', exitCode = 0, error = null) {
  const safeOut = redact(stdout),
    safeErr = redact(stderr);
  return {
    stdout: safeOut,
    stderr: safeErr,
    exitCode,
    error,
    sha256: sha256(JSON.stringify([safeOut, safeErr])),
    redacted: safeOut !== stdout || safeErr !== stderr,
  };
}

export function readEvents(stdout) {
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

export function allowedEvent(event) {
  if (
    ['thread.started', 'turn.started', 'turn.completed'].includes(event?.type)
  )
    return true;
  return (
    ['item.started', 'item.updated', 'item.completed'].includes(event?.type) &&
    ['agent_message', 'reasoning'].includes(event?.item?.type)
  );
}

// Replay strictly: tool activity, retries/errors, duplicate turns, incomplete
// output and unknown event types are operationally inconclusive, never FAIL.
export function analyze(testCase, result) {
  const expected = expectedAnswer(testCase.referenceUtc, testCase.offsetHours);
  const out = {
    verdict: 'INCONCLUSIVE',
    expected,
    actual: null,
    usage: null,
    error: null,
  };
  if (!result) return { ...out, error: 'NO_CAPTURE' };
  if (result.error || result.exitCode !== 0 || result.redacted)
    return { ...out, error: result.error ?? 'PROCESS_FAILED_OR_REDACTED' };
  let events;
  try {
    events = readEvents(result.stdout);
  } catch {
    return { ...out, error: 'INVALID_EVENT_STREAM' };
  }
  if (events.some((event) => !allowedEvent(event)))
    return { ...out, error: 'UNEXPECTED_EVENT_OR_TOOL' };
  const ofType = (type) => events.filter((event) => event.type === type);
  if (
    ofType('thread.started').length !== 1 ||
    ofType('turn.started').length !== 1 ||
    ofType('turn.completed').length !== 1 ||
    events[0]?.type !== 'thread.started' ||
    events[1]?.type !== 'turn.started' ||
    events.at(-1)?.type !== 'turn.completed'
  )
    return { ...out, error: 'INCOMPLETE_OR_MULTIPLE_TURNS' };
  const messages = ofType('item.completed').filter(
    (event) => event.item.type === 'agent_message',
  );
  const usage = ofType('turn.completed')[0].usage;
  if (
    !usage ||
    !Number.isSafeInteger(usage.input_tokens) ||
    usage.input_tokens < 0 ||
    !Number.isSafeInteger(usage.output_tokens) ||
    usage.output_tokens < 0
  )
    return { ...out, error: 'USAGE_UNKNOWN' };
  out.usage = {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  };
  if (
    usage.input_tokens > codexProtocol.stopAfterInputTokens ||
    usage.output_tokens > codexProtocol.stopAfterOutputTokens
  )
    return { ...out, error: 'REPORTED_USAGE_LIMIT_EXCEEDED' };
  if (messages.length !== 1 || typeof messages[0].item.text !== 'string')
    return { ...out, error: 'INVALID_ANSWER' };
  let actual;
  try {
    actual = JSON.parse(messages[0].item.text);
  } catch {
    return { ...out, error: 'INVALID_ANSWER' };
  }
  if (
    !actual ||
    Array.isArray(actual) ||
    Object.keys(actual).sort().join(',') !== 'date,weekday' ||
    typeof actual.date !== 'string' ||
    typeof actual.weekday !== 'string'
  )
    return { ...out, error: 'INVALID_ANSWER' };
  return {
    ...out,
    actual,
    verdict:
      actual.date === expected.date && actual.weekday === expected.weekday
        ? 'MATCH'
        : 'MISMATCH',
  };
}
