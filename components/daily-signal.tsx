'use client';

import { useEffect, useRef, useState } from 'react';
import signal from '@/public/data/daily-signal.json';
import { scrambleQuote } from '@/lib/daily-signal-reveal.mjs';

export function DailySignal() {
  const [phase, setPhase] = useState<'hash' | 'revealing' | 'quote'>('hash');
  const [text, setText] = useState(signal.sha256);
  const frame = useRef(0);
  const running = useRef(false);
  const finish = () => {
    cancelAnimationFrame(frame.current);
    running.current = false;
    setText(signal.quote.text);
    setPhase('quote');
  };

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => {
      if (running.current && (motion.matches || document.hidden)) finish();
    };
    motion.addEventListener('change', stop);
    document.addEventListener('visibilitychange', stop);
    return () => {
      cancelAnimationFrame(frame.current);
      motion.removeEventListener('change', stop);
      document.removeEventListener('visibilitychange', stop);
    };
  }, []);

  const reveal = () => {
    if (running.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }
    running.current = true;
    setPhase('revealing');
    setText(scrambleQuote(signal.quote.text, signal.sha256, 0));
    const count = Array.from(signal.quote.text).length;
    const duration = Math.min(6000, Math.max(1800, count * 45));
    let start: number | undefined;
    let previous = 0;
    const tick = (time: number) => {
      start ??= time;
      const elapsed = time - start;
      if (elapsed >= duration + 250) {
        finish();
        return;
      }
      if (time - previous >= 40) {
        const revealed = Math.floor(
          (Math.max(0, elapsed - 250) / duration) * count,
        );
        setText(scrambleQuote(signal.quote.text, signal.sha256, revealed));
        previous = time;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  return (
    <button
      type="button"
      className="signal-ephemera daily-signal"
      data-phase={phase}
      onClick={reveal}
      aria-disabled={phase === 'revealing'}
      aria-label={
        phase === 'hash'
          ? `Reveal the daily quote, ${signal.edition} UTC`
          : phase === 'revealing'
            ? 'Revealing the daily quote'
            : 'Replay the daily quote reveal'
      }
    >
      <span className="signal-packet-label" aria-hidden="true">
        [ seq / Δ · {phase === 'quote' ? 'quote' : 'sha-256'} ]
      </span>
      <code className="daily-signal-hash" aria-hidden="true">
        {text}
      </code>
      <span className="daily-signal-author" aria-hidden="true">
        {phase === 'quote' ? signal.quote.author : '\u00a0'}
      </span>
      <span className="signal-packet-end" aria-hidden="true">
        {signal.edition} / UTC
      </span>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {phase === 'quote'
          ? `${signal.quote.text} — ${signal.quote.author}`
          : ''}
      </span>
    </button>
  );
}
