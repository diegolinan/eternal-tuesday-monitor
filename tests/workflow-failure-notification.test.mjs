import assert from 'node:assert/strict';
import test from 'node:test';
import {
  discoveryFailureTitle,
  openDiscoveryFailureIssues,
  reportDiscoveryFailure,
  resolveDiscoveryFailures,
} from '../scripts/notifications/workflow-failure.mjs';

function response(body = {}, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test('failure issue matching excludes pull requests and unrelated issues', () => {
  assert.deepEqual(
    openDiscoveryFailureIssues([
      { number: 1, title: discoveryFailureTitle, state: 'open' },
      {
        number: 2,
        title: discoveryFailureTitle,
        state: 'open',
        pull_request: {},
      },
      { number: 3, title: 'Something else', state: 'open' },
      { number: 4, title: discoveryFailureTitle, state: 'closed' },
    ]).map((issue) => issue.number),
    [1],
  );
});

test('a repeated failure comments on the existing issue instead of opening another', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (!options.method)
      return response([{ number: 52, title: discoveryFailureTitle, state: 'open' }]);
    return response();
  };

  await reportDiscoveryFailure({
    owner: 'diegolinan',
    repo: 'eternal-tuesday-monitor',
    runId: '123',
    token: 'hidden',
    fetchImpl,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.method, 'POST');
  assert.match(calls[1].url, /issues\/52\/comments$/);
  assert.match(JSON.parse(calls[1].options.body).body, /Inspect run 123/);
});

test('a successful recovery comments on and closes every matching open issue', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (!options.method)
      return response([
        { number: 52, title: discoveryFailureTitle, state: 'open' },
        { number: 53, title: discoveryFailureTitle, state: 'open' },
      ]);
    return response();
  };

  const resolved = await resolveDiscoveryFailures({
    owner: 'diegolinan',
    repo: 'eternal-tuesday-monitor',
    runId: '456',
    token: 'hidden',
    fetchImpl,
  });

  assert.deepEqual(resolved, [52, 53]);
  assert.equal(calls.length, 5);
  for (const issueNumber of [52, 53]) {
    const comment = calls.find(({ url }) =>
      url.endsWith(`/issues/${issueNumber}/comments`),
    );
    const close = calls.find(({ url }) => url.endsWith(`/issues/${issueNumber}`));
    assert.equal(comment.options.method, 'POST');
    assert.match(JSON.parse(comment.options.body).body, /successful run 456/);
    assert.equal(close.options.method, 'PATCH');
    assert.deepEqual(JSON.parse(close.options.body), {
      state: 'closed',
      state_reason: 'completed',
    });
  }
});
