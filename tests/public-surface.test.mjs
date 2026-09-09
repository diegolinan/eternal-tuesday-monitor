import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('the public status panel exposes status but no administrative actions', async () => {
  const source = await read('components/automation-status.tsx');
  const page = await read('app/page.tsx');
  const compiledStatus = await read('public/data/system-status.json');
  assert.doesNotMatch(source, /Inspect discovery runs/i);
  assert.doesNotMatch(source, /Run five probes manually/i);
  assert.doesNotMatch(source, /evaluate-model\.yml/i);
  assert.doesNotMatch(source, /api\.github\.com/i);
  assert.doesNotMatch(source, /github/i);
  assert.doesNotMatch(compiledStatus, /workflow|repository|html_url|run_id/i);
  assert.match(source, /Latest source scan/);
  assert.match(source, /Today&apos;s planned source scan/);
  assert.match(source, /Next planned source scan/);
  assert.match(source, /does not contact a model/);
  assert.match(source, /ALL TIMES SHOWN IN YOUR LOCAL TIME/);
  assert.match(source, /IN \{remaining\(nextWindow, now\)\}/);
  assert.match(source, /SINCE PLANNED/);
  assert.match(source, /STARTING WINDOW/);
  assert.match(source, /AWAITING START/);
  assert.match(source, /withBasePath\('\/data\/system-status\.json'\)/);
  assert.match(source, /useState<Date \| null>\(null\)/);
  const ledgerPosition = page.indexOf('<ClaimLedger');
  const statusPosition = page.indexOf('<AutomationStatus />');
  const guidePosition = page.indexOf('<ReadingGuide />');
  const findingsPosition = page.indexOf('id="observations"');
  assert.ok(ledgerPosition >= 0);
  assert.ok(statusPosition > ledgerPosition);
  assert.ok(statusPosition < guidePosition);
  assert.ok(statusPosition < findingsPosition);
  assert.equal(page.lastIndexOf('<AutomationStatus />'), statusPosition);
  assert.match(page, /href="#automation">Status<\/a>/);
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
  const modelsPage = await read('app/models/page.tsx');
  assert.match(source, /vendor-register-group/);
  assert.match(source, /registry-status-group/);
  assert.doesNotMatch(source, /visible\.slice\(0, 24\)/);
  assert.match(modelsPage, /model-operations\.json/);
  assert.match(source, /Official-source scan/);
  assert.match(source, /Controlled-test readiness/);
  assert.match(source, /Behavioral probe evidence/);
  assert.match(source, /Method decision unchanged since/);
  assert.match(source, /No behavioral probe attempt recorded/);
  assert.match(source, /NO TEST EVIDENCE/);
  assert.doesNotMatch(source, /NOT RUN|NEVER TESTED/);
  assert.match(source, /CURATED HISTORICAL IDENTITY/);
  assert.match(source, /the daily listing\s+scan does not apply/);
  assert.match(source, /Dated observation context/);
  assert.match(source, /accepted empirical evidence and historical/);
  assert.match(source, /hasProbeEvidence/);
  assert.match(source, /return 'EVIDENCE_WATCH'/);
  assert.match(source, /eligibilityGroups/);
  assert.doesNotMatch(source, /Adoption eligibility assessed/);
});

test('the public evidence watch separates search, candidates and verdicts', async () => {
  const watch = await read('components/evidence-watch.tsx');
  const form = await read('app/contribute/page.tsx');
  assert.match(watch, /A match becomes a review candidate/);
  assert.match(watch, /not a PASS, FAIL/);
  assert.match(watch, /Review classifies a lead/);
  assert.match(watch, /controlled behavioral\s+reproduction/);
  assert.match(watch, /matches before known-lead filtering/);
  assert.doesNotMatch(
    watch,
    /candidateCounts\.latestSearchLeads[^\n]*new lead\s*\n/,
  );
  assert.match(watch, /browser&apos;s local time/);
  assert.doesNotMatch(
    watch,
    /dateStyle:[\s\S]*timeZoneName:|timeZoneName:[\s\S]*dateStyle:/,
  );
  assert.doesNotMatch(watch, /workflow|repository_dispatch|github/i);
  assert.match(form, /Every submission is checked by a person/);
  assert.match(form, /cannot directly\s+change the Monitor/);
  assert.match(form, /No email address is requested/);
  assert.match(form, /Other \/ not listed/);
  assert.match(form, /I don’t know the exact model/);
  assert.match(form, /Review your lead/);
  assert.match(form, /Internal receipt/);
  assert.match(form, /A firsthand\s+observation may be sent without one/);
  assert.match(form, /useState<SubmissionType>\(''\)/);
  assert.match(form, /Choose the kind of lead/);
  assert.match(form, /\{submissionType && \(/);
  assert.doesNotMatch(form, /useState(?:<SubmissionType>)?\('FOUND_SOURCE'\)/);
  assert.match(form, /REQUIRED/);
  assert.match(form, /OPTIONAL/);
  assert.doesNotMatch(form, /github|repository_dispatch|pull request/i);
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

test('the public reading path separates the monitor question from operations', async () => {
  const page = await read('app/page.tsx');
  assert.match(page, /What do we know now\?/);
  assert.match(page, /Current evidence state/);
  assert.match(page, /Catalog identity is not evidence/);
  assert.match(page, /Open the model register/);
  assert.match(page, /Evidence gap assessed through/);
  assert.doesNotMatch(
    page,
    /ARTICLE&apos;S QUESTION|The article described|article&apos;s evidence/i,
  );
  assert.doesNotMatch(page, /<ModelInventory/);
});

test('the public observation projection does not expose retired article copy', async () => {
  const compiled = await read('public/data/monitor.json');
  assert.doesNotMatch(compiled, /ARTICLE-SOURCE-1|ARTICLE SEARCH CUTOFF/);
  assert.doesNotMatch(compiled, /The article found|At the article cutoff/i);
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
