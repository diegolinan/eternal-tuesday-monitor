import test from 'node:test';
import assert from 'node:assert/strict';
import { scrambleQuote } from '../lib/daily-signal-reveal.mjs';

const hash = 'a'.repeat(64);

test('each revealed character stays fixed while the remainder changes', () => {
  const phrase = 'The world moved.';
  for (let count = 0; count < phrase.length; count++) {
    const first = scrambleQuote(phrase, hash, count, () => 0);
    const second = scrambleQuote(phrase, hash, count, () => 0.9);
    assert.equal(first.slice(0, count), phrase.slice(0, count));
    assert.equal(second.slice(0, count), phrase.slice(0, count));
    assert.notEqual(first.slice(count), second.slice(count));
  }
});

test('completion returns the exact quote with no random suffix or lost Unicode', () => {
  const phrase = 'Mañana ≠ hoy. 🕰️\nStill true?';
  const length = Array.from(phrase).length;
  assert.equal(scrambleQuote(phrase, hash, length), phrase);
  assert.equal(scrambleQuote(phrase, hash, length + 10), phrase);
  assert.ok(
    scrambleQuote(phrase, hash, 16, () => 0).startsWith(
      Array.from(phrase).slice(0, 16).join(''),
    ),
  );
});

test('short and long quotes fit without truncating the revealed text', () => {
  assert.equal(scrambleQuote('Short.', hash, 0).length, 64);
  const long = 'A longer phrase. '.repeat(20);
  assert.equal(scrambleQuote(long, hash, 0).length, long.length);
  assert.equal(scrambleQuote(long, hash, long.length), long);
});
