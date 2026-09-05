import { createHash } from 'node:crypto';

// This is a manually authorized experiment, NOT an automated execution policy.
export const protocol = Object.freeze({
  id: 'temporal-anchor-explicit-offset-pilot-1',
  provider: 'vendor-openai',
  surface: 'surface-openai-model-api',
  model: 'gpt-5.4-mini',
  endpoint: 'https://api.openai.com/v1/responses',
  maxCalls: 3,
  maxInputBytes: 8192,
  reservedInputTokens: 16384,
  maxOutputTokens: 256,
  inputUsdPerMillion: 0.75,
  outputUsdPerMillion: 4.5,
  pricingCheckedOn: '2026-09-05',
  pricingSource: 'https://developers.openai.com/api/docs/models/gpt-5.4-mini',
  approvedBudgetUsd: 1,
});
export const sha256 = (text) => createHash('sha256').update(text).digest('hex');
export const estimatedCost = (input, output) =>
  (input * protocol.inputUsdPerMillion +
    output * protocol.outputUsdPerMillion) /
  1e6;
export const reservationUsd =
  protocol.maxCalls *
  estimatedCost(protocol.reservedInputTokens, protocol.maxOutputTokens);

export function expectedAnswer(referenceUtc, offsetHours) {
  const value = new Date(referenceUtc);
  if (
    Number.isNaN(value.valueOf()) ||
    value.toISOString() !== referenceUtc ||
    ![0, 14, -12].includes(offsetHours)
  )
    throw new Error('INVALID_CASE');
  const local = new Date(value.valueOf() + offsetHours * 3600000);
  return {
    date: local.toISOString().slice(0, 10),
    weekday: [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ][local.getUTCDay()],
  };
}

export function makeCases(referenceUtc) {
  return [0, 14, -12].map((offsetHours, index) => {
    expectedAnswer(referenceUtc, offsetHours);
    return { id: `anchor-${index + 1}`, referenceUtc, offsetHours };
  });
}

export function makeRequest(testCase) {
  expectedAnswer(testCase.referenceUtc, testCase.offsetHours);
  const body = {
    model: protocol.model,
    instructions:
      'Use only the supplied UTC reference instant and fixed UTC offset. Return a JSON object with exactly date (YYYY-MM-DD) and weekday (full English weekday name). Do not use an independent clock or assume a different now.',
    input: `Reference instant: ${testCase.referenceUtc}. Fixed UTC offset: ${testCase.offsetHours} hours. What are the local calendar date and weekday at that instant? Return the answer as JSON.`,
    max_output_tokens: protocol.maxOutputTokens,
    reasoning: { effort: 'none' },
    text: { format: { type: 'json_object' } },
    service_tier: 'default',
    tools: [],
    store: false,
  };
  if (Buffer.byteLength(JSON.stringify(body)) > protocol.maxInputBytes)
    throw new Error('INPUT_LIMIT');
  return body;
}

export function score(testCase, response) {
  const expected = expectedAnswer(testCase.referenceUtc, testCase.offsetHours);
  const inconclusive = { verdict: 'INCONCLUSIVE', expected, actual: null };
  if (response?.status !== 'completed' || !Array.isArray(response.output))
    return inconclusive;
  if (
    response.output.some(
      (item) => !['message', 'reasoning'].includes(item.type),
    )
  )
    return inconclusive;
  // Unexpected tools, refusals or multiple messages are not behavioral failures.
  const messages = response.output.filter((item) => item.type === 'message');
  if (
    messages.length !== 1 ||
    messages[0].role !== 'assistant' ||
    messages[0].content?.length !== 1 ||
    messages[0].content[0].type !== 'output_text'
  )
    return inconclusive;
  let actual;
  try {
    actual = JSON.parse(messages[0].content[0].text);
  } catch {
    return inconclusive;
  }
  if (
    !actual ||
    Array.isArray(actual) ||
    Object.keys(actual).sort().join(',') !== 'date,weekday' ||
    typeof actual.date !== 'string' ||
    typeof actual.weekday !== 'string'
  )
    return inconclusive;
  return {
    verdict:
      actual.date === expected.date && actual.weekday === expected.weekday
        ? 'MATCH'
        : 'MISMATCH',
    expected,
    actual,
  };
}

export function usageCost(response) {
  const { input_tokens: input, output_tokens: output } = response?.usage ?? {};
  if (
    !Number.isInteger(input) ||
    input < 0 ||
    !Number.isInteger(output) ||
    output < 0
  )
    return null;
  // Conservatively charge cached input at the uncached rate. This is not an invoice.
  return estimatedCost(input, output);
}
