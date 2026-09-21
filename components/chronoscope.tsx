export function Chronoscope() {
  return (
    <figure className="hero-visual chronoscope">
      <div className="chronoscope-issue" aria-hidden="true">
        <span>FIELD NOTE</span>
        <strong>№ 01</strong>
      </div>
      <svg
        viewBox="0 0 760 720"
        aria-labelledby="chronoscope-title chronoscope-description"
      >
        <title id="chronoscope-title">The continuity chronoscope</title>
        <desc id="chronoscope-description">
          Three offset clock faces connected by an orbital path, illustrating
          the difference between conversation order and elapsed real-world time.
        </desc>
        <defs>
          <filter id="roughen" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence
              baseFrequency="0.035"
              numOctaves="2"
              seed="17"
              type="fractalNoise"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="1.2"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
          <path
            id="orbit-path"
            d="M96,402 C148,151 480,91 656,276 C793,420 611,635 362,623 C142,611 42,503 96,402Z"
          />
        </defs>

        <g className="chrono-orbit" filter="url(#roughen)">
          <use href="#orbit-path" />
          <use href="#orbit-path" transform="rotate(14 380 360) scale(.82)" />
        </g>

        <g className="chrono-clock chrono-clock-main" transform="translate(380 347)">
          <circle className="clock-shadow" r="183" cx="11" cy="15" />
          <circle className="clock-face" r="183" />
          <circle className="clock-ring" r="158" />
          {Array.from({ length: 12 }).map((_, index) => (
            <line
              className="clock-tick"
              key={index}
              x1="0"
              y1="-143"
              x2="0"
              y2={index % 3 === 0 ? '-122' : '-131'}
              transform={`rotate(${index * 30})`}
            />
          ))}
          <g className="clock-hand-hour">
            <line x1="0" y1="8" x2="0" y2="-80" />
            <circle cy="-80" r="7" />
          </g>
          <g className="clock-hand-minute">
            <line x1="0" y1="10" x2="0" y2="-119" />
            <path d="M-8,-113 L0,-132 L8,-113Z" />
          </g>
          <circle className="clock-pin" r="15" />
          <text className="clock-word" x="0" y="82" textAnchor="middle">
            TUESDAY
          </text>
          <text className="clock-sub" x="0" y="108" textAnchor="middle">
            CONTEXT IS NOT A CLOCK
          </text>
        </g>

        <g className="chrono-tag chrono-tag-now" transform="translate(82 126)">
          <circle r="52" />
          <text x="0" y="-5" textAnchor="middle">NOW</text>
          <text className="chrono-tag-small" x="0" y="17" textAnchor="middle">?</text>
        </g>
        <g className="chrono-tag chrono-tag-then" transform="translate(656 525)">
          <circle r="47" />
          <text x="0" y="-5" textAnchor="middle">THEN</text>
          <text className="chrono-tag-small" x="0" y="17" textAnchor="middle">RECORDED</text>
        </g>

        <text className="orbit-copy">
          <textPath href="#orbit-path" startOffset="4%">
            OBSERVE · DATE · VERIFY · REVISIT · PRESERVE ·
          </textPath>
        </text>
      </svg>
      <div className="chronoscope-caption">
        <span>FIG. 01</span>
        <p>
          A conversation has an order. The world has a clock. The Monitor tests
          where those two diverge.
        </p>
      </div>
    </figure>
  );
}
