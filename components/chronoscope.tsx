'use client';

import { useEffect, useId, useRef, useState } from 'react';

// Deterministic geometry: decorative, never derived from model scores.
const points = Array.from({ length: 360 }, (_, i) => {
  const a = i * 2.399963;
  const r = Math.sqrt(i / 360) * 114;
  return {
    x: 245 + Math.cos(a) * r,
    y: 157 + Math.sin(a) * r * 0.8,
    r: 0.8 + (i % 4) * 0.35,
  };
});

export function Chronoscope() {
  const [elapsed, setElapsed] = useState(62);
  const [revalidated, setRevalidated] = useState(false);
  const [playing, setPlaying] = useState(false);
  const figure = useRef<HTMLElement>(null);
  const id = useId().replaceAll(':', '');
  const hours = Math.round(elapsed * 0.72);
  const shift = elapsed * 0.82;

  useEffect(() => {
    if (!playing) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let progress = 0;
    const timer = window.setInterval(() => {
      progress = Math.min(100, progress + 1);
      setElapsed(progress);
      if (progress === 100) setPlaying(false);
    }, 70);
    const motionChanged = () => {
      if (media.matches) setPlaying(false);
    };
    media.addEventListener('change', motionChanged);
    const stop = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener('visibilitychange', stop);
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) setPlaying(false);
    });
    if (figure.current) observer.observe(figure.current);
    return () => {
      window.clearInterval(timer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', stop);
      media.removeEventListener('change', motionChanged);
    };
  }, [playing]);

  return (
    <figure ref={figure} className="hero-visual chronoscope time-instrument">
      <div className="instrument-title">
        <span>ETM / State drift</span>
        <span>Interactive illustration ↘</span>
      </div>
      <div className="instrument-stage">
        <svg viewBox="0 0 500 326" aria-labelledby={`${id}-title`}>
          <title id={`${id}-title`}>
            A retained context field and a changing world field separate as time
            advances
          </title>
          <defs>
            <pattern
              id={`${id}-dots`}
              width="7"
              height="7"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="0.6" fill="#20211f" opacity="0.3" />
            </pattern>
            <clipPath id={`${id}-clip`}>
              <rect x="10" y="34" width="480" height="242" />
            </clipPath>
          </defs>
          <rect width="500" height="326" fill="var(--pink)" />
          <rect
            x="10"
            y="34"
            width="480"
            height="242"
            fill={`url(#${id}-dots)`}
          />
          <g clipPath={`url(#${id}-clip)`}>
            <g
              className="retained-field"
              style={{
                transform: `translate(${revalidated ? shift : 0}px, ${revalidated ? -shift * 0.3 : 0}px)`,
              }}
            >
              <rect
                x="105"
                y="61"
                width="225"
                height="199"
                fill="#f8f7f1"
                fillOpacity="0.7"
                stroke="#20211f"
              />
              {points.map((point, i) => (
                <circle
                  key={i}
                  cx={point.x - 35}
                  cy={point.y + 6}
                  r={point.r}
                  fill="#20211f"
                />
              ))}
              <path
                d="M105 99H330M144 61V260"
                stroke="#20211f"
                strokeWidth="0.65"
              />
            </g>
            <g
              className="world-field"
              style={{ transform: `translate(${shift}px, ${-shift * 0.3}px)` }}
            >
              <path
                d="M117 210L227 47L349 122L239 285Z"
                fill="var(--cyan)"
                fillOpacity="0.78"
                stroke="#20211f"
              />
              {Array.from({ length: 15 }, (_, i) => (
                <path
                  key={i}
                  d={`M${117 + i * 8.1} ${210 + i * 5}L${227 + i * 8.1} ${47 + i * 5}`}
                  stroke="#20211f"
                  strokeWidth="0.7"
                />
              ))}
              <ellipse
                cx="235"
                cy="166"
                rx="96"
                ry="41"
                fill="none"
                stroke="#20211f"
              />
              <ellipse
                cx="235"
                cy="166"
                rx="52"
                ry="106"
                fill="none"
                stroke="#20211f"
              />
            </g>
            <path
              d="M16 157H484M245 40V273"
              stroke="#20211f"
              strokeDasharray="2 5"
              opacity="0.6"
            />
            <rect
              className="instrument-scan"
              x="18"
              y="34"
              width="2"
              height="242"
              fill="#20211f"
            />
          </g>
          <path
            d="M14 16H32M23 7V25M468 306H490M479 295V317"
            stroke="#20211f"
          />
          <text x="42" y="20" className="instrument-svg-label">
            Same thread. Different state.
          </text>
          <text x="14" y="307" className="instrument-svg-label">
            {revalidated ? 'Context revalidated' : 'Context retained at t₀'}
          </text>
          <text x="340" y="307" className="instrument-svg-label">
            World +{hours}h
          </text>
        </svg>
        <div className="instrument-readout">
          <span>Context / world</span>
          <strong>
            {revalidated || hours === 0
              ? 'Aligned in this illustration'
              : 'Same sequence ≠ same state'}
          </strong>
        </div>
      </div>
      <div className="instrument-controls">
        <label htmlFor={`${id}-elapsed`}>
          Move time <span>+{hours}h</span>
        </label>
        <input
          id={`${id}-elapsed`}
          type="range"
          min="0"
          max="100"
          value={elapsed}
          aria-label="Elapsed time in the illustration"
          aria-valuetext={`${hours} illustrative hours`}
          onChange={(event) => {
            setPlaying(false);
            setElapsed(Number(event.target.value));
          }}
        />
        <div>
          <button
            type="button"
            onClick={() => {
              if (playing) setPlaying(false);
              else {
                const reduce = window.matchMedia(
                  '(prefers-reduced-motion: reduce)',
                ).matches;
                setElapsed(reduce ? 100 : 0);
                setRevalidated(false);
                setPlaying(!reduce);
              }
            }}
          >
            {playing ? 'Pause' : 'Play sequence'}{' '}
            <span aria-hidden="true">{playing ? 'Ⅱ' : '→'}</span>
          </button>
          <button
            type="button"
            aria-pressed={revalidated}
            onClick={() => setRevalidated(!revalidated)}
          >
            {revalidated ? 'Keep old context' : 'Revalidate context'}{' '}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
      <figcaption className="chronoscope-caption">
        <span>
          Illustration
          <br />
          Not a model test
        </span>
        <p>Keeping a conversation is not the same as keeping it current.</p>
      </figcaption>
    </figure>
  );
}
