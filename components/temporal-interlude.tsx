'use client';

import { useEffect, useRef, useState } from 'react';

export function TemporalInterlude() {
  const figure = useRef<HTMLElement>(null);
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRun(1);
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    if (figure.current) observer.observe(figure.current);
    return () => observer.disconnect();
  }, []);
  return (
    <figure className="temporal-interlude" ref={figure}>
      <div className="temporal-stage" aria-hidden="true">
        <div className="temporal-weave">
          {Array.from({ length: 6 }, (_, row) => (
            <span key={row}>{'context / sequence / '.repeat(9)}</span>
          ))}
        </div>
        <div className="temporal-words">
          <span>Same thread.</span>
          <strong>Different now.</strong>
        </div>
        <div key={run} className={`temporal-now${run ? ' is-running' : ''}`}>
          <span>NOW ↗</span>
        </div>
      </div>
      <figcaption>
        <span>
          Context stays. Time moves.
          <small>Conceptual illustration · Not live telemetry</small>
        </span>
        <button type="button" onClick={() => setRun((value) => value + 1)}>
          Replay the drift ↗
        </button>
      </figcaption>
    </figure>
  );
}
