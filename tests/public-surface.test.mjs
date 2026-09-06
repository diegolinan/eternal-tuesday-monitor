import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('the public status panel exposes status but no administrative actions', async () => {
  const source = await read('components/automation-status.tsx');
  const compiledStatus = await read('public/data/system-status.json');
  assert.doesNotMatch(source, /Inspect discovery runs/i);
  assert.doesNotMatch(source, /Run five probes manually/i);
  assert.doesNotMatch(source, /evaluate-model\.yml/i);
  assert.doesNotMatch(source, /api\.github\.com/i);
  assert.doesNotMatch(source, /github/i);
  assert.doesNotMatch(compiledStatus, /workflow|repository|html_url|run_id/i);
  assert.match(source, /Latest source scan started/);
  assert.match(source, /Today&apos;s scheduled scan/);
  assert.match(source, /Next scheduled scan/);
  assert.match(source, /does not contact a model/);
  assert.match(source, /ALL TIMES SHOWN IN YOUR LOCAL TIME/);
  assert.match(source, /IN \{remaining\(nextWindow, now\)\}/);
  assert.match(source, /STARTING WINDOW/);
  assert.match(source, /AWAITING START/);
  assert.match(source, /withBasePath\('\/data\/system-status\.json'\)/);
  assert.match(source, /useState<Date \| null>\(null\)/);
});

test('the status publisher emits only neutral public fields', async () => {
  const { compilePublicSystemStatus } =
    await import('../lib/system-status.mjs');
  const result = compilePublicSystemStatus(
    [
      {
        id: 42,
        event: 'workflow_dispatch',
        status: 'completed',
        conclusion: 'success',
        created_at: '2026-09-06T14:00:00Z',
        run_started_at: '2026-09-06T14:00:05Z',
        updated_at: '2026-09-06T14:01:00Z',
        html_url: 'https://example.invalid/private-run',
      },
      {
        id: 41,
        event: 'schedule',
        status: 'completed',
        conclusion: 'failure',
        created_at: '2026-09-06T13:10:00Z',
        run_started_at: '2026-09-06T13:10:05Z',
        updated_at: '2026-09-06T13:11:00Z',
        html_url: 'https://example.invalid/routine-run',
      },
    ],
    new Date('2026-09-06T14:02:00Z'),
  );
  assert.deepEqual(Object.keys(result), [
    'schemaVersion',
    'generatedAt',
    'latestCheck',
    'lastRoutineCheck',
  ]);
  assert.equal(result.latestCheck.state, 'complete');
  assert.equal(result.lastRoutineCheck.state, 'needs_attention');
  assert.equal(
    result.lastRoutineCheck.scheduledFor,
    '2026-09-06T12:43:00.000Z',
  );
  assert.doesNotMatch(
    JSON.stringify(result),
    /workflow|html_url|run_id|42|41/i,
  );
});

test('the product and surface station is driven by accepted observations', async () => {
  const source = await read('app/page.tsx');
  assert.match(source, /<SurfaceMap items=\{observations\}/);
  assert.doesNotMatch(source, /<strong>GPT-5\.6 SOL<\/strong>/);
  assert.match(
    source,
    /A catalog identity\s+never creates a product association/,
  );
  assert.match(source, /`\$\{product\.name\} \/ \$\{surface\.name\}`/);
  assert.match(source, /setScope\(nextScope\)/);
});

test('the model register separates source scans, eligibility, and evidence', async () => {
  const source = await read('components/model-inventory.tsx');
  const page = await read('app/page.tsx');
  assert.match(source, /vendor-register-group/);
  assert.match(source, /registry-status-group/);
  assert.doesNotMatch(source, /visible\.slice\(0, 24\)/);
  assert.match(page, /data\/model-operations\.json/);
  assert.match(source, /Official-source scan/);
  assert.match(source, /Behavioral-test eligibility/);
  assert.match(source, /Behavioral probe evidence/);
  assert.match(source, /Eligibility decision unchanged since/);
  assert.match(source, /No behavioral probe attempt recorded/);
  assert.match(source, /NO TEST EVIDENCE/);
  assert.doesNotMatch(source, /NOT RUN|NEVER TESTED/);
  assert.match(source, /CURATED HISTORICAL IDENTITY/);
  assert.match(source, /the daily listing\s+scan does not apply/);
  assert.match(source, /Dated observation context/);
  assert.match(source, /not accepted probe evidence/);
  assert.match(source, /hasProbeEvidence/);
  assert.match(source, /model\.testabilityState === 'REVIEW_REQUIRED'/);
  assert.match(source, /eligibilityGroups/);
  assert.doesNotMatch(source, /Adoption eligibility assessed/);
});

test('the public copy explains dates and status vocabularies', async () => {
  const page = await read('app/page.tsx');
  const inventory = await read('components/model-inventory.tsx');
  assert.match(page, /Four different claims/);
  assert.match(page, /Official-source scan/);
  assert.match(page, /Eligibility decision/);
  assert.match(page, /Behavioral probe/);
  assert.match(page, /Freshness review/);
  assert.match(page, /CURRENT means applicable/);
  assert.match(page, /Evidence included through/);
  assert.match(page, /Evidence age recalculated/);
  assert.doesNotMatch(page, /03 SEP 2026|07 SEP 2026|2026-09-07/);
  assert.match(
    inventory,
    /At least one probe has accepted behavioral evidence/,
  );
  assert.match(inventory, /What must happen before a behavioral result exists/);
});

test('the public changelog omits internal review mechanics', async () => {
  const page = await read('app/changelog/page.tsx');
  const compiled = await read('public/data/changelog.json');
  assert.doesNotMatch(page, /pull_request_url|Reviewed proposal|github/i);
  assert.doesNotMatch(compiled, /pull_request_url|github\.com/i);
  assert.match(
    page,
    /routine\s+source scan with no accepted change creates no entry/,
  );
});
