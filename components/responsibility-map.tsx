export function ResponsibilityMap() {
  return (
    <section
      className="responsibility-map"
      aria-labelledby="responsibility-title"
    >
      <header>
        <p className="section-code">RESPONSIBILITY MAP / TWO DIFFERENT JOBS</p>
        <h2 id="responsibility-title">
          Work Can Be Automated.
          <br />
          Evidence Needs Judgment.
        </h2>
      </header>
      <div className="responsibility-lanes">
        <div className="responsibility-lane machine-lane">
          <span className="lane-code">01 / BOUNDED OPERATIONS</span>
          <svg
            viewBox="0 0 240 50"
            aria-hidden="true"
            className="responsibility-trace"
          >
            <path d="M10 25H230" />
            {[10, 80, 150, 220].map((x) => (
              <rect key={x} x={x} y="15" width="20" height="20" />
            ))}
          </svg>
          <h3>Detect. Search. Recalculate. Execute.</h3>
          <p>
            Automated systems do bounded work. Approved catalog rules can accept
            identities—not behavioral verdicts.
          </p>
        </div>
        <div className="responsibility-lane human-lane">
          <span className="lane-code">02 / HUMAN EVIDENCE REVIEW</span>
          <svg
            viewBox="0 0 240 50"
            aria-hidden="true"
            className="responsibility-trace"
          >
            <path d="M10 25H90M150 25H230M120 0V50" />
            <circle cx="120" cy="25" r="18" />
            <path d="m110 25 7 7 14-14" />
          </svg>
          <h3>Check The Source. Bind The Claim.</h3>
          <p>
            People assess evidence, scope and limitations before a behavioral
            observation is accepted for publication.
          </p>
        </div>
      </div>
      <p className="responsibility-boundary">
        A detected lead is not accepted evidence. A completed run is not an
        accepted verdict.
      </p>
    </section>
  );
}
