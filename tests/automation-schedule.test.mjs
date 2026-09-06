import assert from 'node:assert/strict';
import test from 'node:test';
import {
  elapsed,
  eventLabel,
  localDateKey,
  nextScheduledWindow,
  remaining,
  scheduledWindowFor,
} from '../lib/automation-schedule.mjs';

test('the nominal window is 09:43 in Buenos Aires', () => {
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
});

test('an overdue run remains attributable to today while the next window is tomorrow', () => {
  const afterWindow = new Date('2026-09-06T14:34:00Z');
  const todayWindow = scheduledWindowFor(afterWindow);
  assert.equal(localDateKey(todayWindow), '2026-09-06');
  assert.equal(elapsed(todayWindow, afterWindow), '1H 51M 00S');
  assert.equal(
    nextScheduledWindow(afterWindow).toISOString(),
    '2026-09-07T12:43:00.000Z',
  );
});

test('manual and scheduled workflow attempts are labeled separately', () => {
  assert.equal(eventLabel('workflow_dispatch'), 'MANUAL');
  assert.equal(eventLabel('schedule'), 'SCHEDULED');
});
