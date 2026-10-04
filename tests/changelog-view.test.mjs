import test from 'node:test';
import assert from 'node:assert/strict';
import { groupChanges } from '../lib/changelog-view.mjs';

const events = Object.freeze([
  Object.freeze({
    id: 'a',
    recorded_on: '2026-09-05',
    type: 'MODEL_DISCOVERED',
  }),
  Object.freeze({
    id: 'b',
    recorded_on: '2026-09-09',
    type: 'OBSERVATION_ADDED',
  }),
  Object.freeze({
    id: 'c',
    recorded_on: '2026-09-09',
    type: 'MODEL_DISCOVERED',
  }),
]);
test('date groups are newest first and preserve all original entries', () => {
  assert.deepEqual(
    groupChanges(events).map(({ date, events }) => [
      date,
      events.map((e) => e.id),
    ]),
    [
      ['2026-09-09', ['b', 'c']],
      ['2026-09-05', ['a']],
    ],
  );
  assert.equal(groupChanges(events)[0].events[0], events[1]);
});
test('type filters do not merge policy changes with behavioral observations', () => {
  assert.deepEqual(groupChanges(events, 'OBSERVATION_ADDED'), [
    { date: '2026-09-09', events: [events[1]] },
  ]);
  assert.equal(groupChanges(events, 'MODEL_DISCOVERED').length, 2);
  assert.deepEqual(groupChanges(events, 'MISSING'), []);
  assert.deepEqual(groupChanges([]), []);
});
