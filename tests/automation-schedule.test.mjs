import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentWindowState,
  elapsed,
  nextScheduledWindow,
  remaining,
  SCHEDULE,
  scheduleKey,
  scheduledWindowAtOrBefore,
  scheduledWindowFor,
} from '../lib/automation-schedule.mjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));

test('the nominal window is defined once at 12:43 UTC', async () => {
  const beforeWindow = new Date('2026-09-06T11:00:00Z');
  assert.equal(
    scheduledWindowFor(beforeWindow).toISOString(),
    '2026-09-06T12:43:00.000Z',
  );
  assert.equal(
    nextScheduledWindow(beforeWindow).toISOString(),
    '2026-09-06T12:43:00.000Z',
  );
  assert.equal(
    remaining(scheduledWindowFor(beforeWindow), beforeWindow),
    '1H 43M 00S',
  );
  const workflow = await readFile(
    path.join(root, '.github/workflows/discover-models.yml'),
    'utf8',
  );
  assert.match(
    workflow,
    new RegExp(`cron: ['"]${SCHEDULE.minuteUtc} ${SCHEDULE.hourUtc} \\*`),
  );
});

test('an overdue run remains attributable to today while the next window is tomorrow', () => {
  const afterWindow = new Date('2026-09-06T14:34:00Z');
  const todayWindow = scheduledWindowFor(afterWindow);
  assert.equal(scheduleKey(todayWindow), '2026-09-06');
  assert.equal(elapsed(todayWindow, afterWindow), '1H 51M 00S');
  assert.equal(
    nextScheduledWindow(afterWindow).toISOString(),
    '2026-09-07T12:43:00.000Z',
  );
});

test('routine windows progress through grace and awaiting states', () => {
  const before = new Date('2026-09-06T12:42:00Z');
  const withinGrace = new Date('2026-09-06T12:50:00Z');
  const afterGrace = new Date('2026-09-06T13:10:00Z');
  assert.equal(
    currentWindowState({ now: before, lastRoutineCheck: null }),
    'on_deck',
  );
  assert.equal(
    currentWindowState({ now: withinGrace, lastRoutineCheck: null }),
    'starting_window',
  );
  assert.equal(
    currentWindowState({ now: afterGrace, lastRoutineCheck: null }),
    'awaiting_start',
  );
  assert.equal(
    currentWindowState({
      now: afterGrace,
      lastRoutineCheck: {
        scheduledFor: '2026-09-06T12:43:00.000Z',
        state: 'complete',
      },
    }),
    'complete',
  );
  assert.equal(
    scheduledWindowAtOrBefore(new Date('2026-09-06T08:00:00Z')).toISOString(),
    '2026-09-05T12:43:00.000Z',
  );
});
