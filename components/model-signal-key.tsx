export function ModelSignalGlyph({
  kind,
}: {
  kind: 'catalog' | 'readiness' | 'evidence';
}) {
  return (
    <svg className="model-signal-glyph" viewBox="0 0 44 44" aria-hidden="true">
      {kind === 'catalog' ? (
        <>
          <path d="M9 8h26v28H9zM15 15h14M15 22h14M15 29h8" />
          <path className="signal-accent" d="M5 5h8M5 5v8M39 39h-8M39 39v-8" />
        </>
      ) : kind === 'readiness' ? (
        <>
          <path d="M8 12h28M8 22h28M8 32h28" />
          <path className="signal-accent" d="M16 7v10M29 17v10M20 27v10" />
        </>
      ) : (
        <>
          <path d="M8 7v30h29M13 16h8M13 24h18" />
          <circle className="signal-accent" cx="30" cy="13" r="5" />
        </>
      )}
    </svg>
  );
}

export function ModelSignalKey() {
  return (
    <aside
      className="model-signal-key"
      aria-label="Three independent model signals"
    >
      <header>
        <span className="section-code">READ THE THREE SIGNALS</span>
        <p>Independent questions. Not a progress bar.</p>
      </header>
      <div className="model-signal-columns">
        <div data-signal="catalog">
          <ModelSignalGlyph kind="catalog" />
          <h3>Catalog</h3>
          <p>What identity is recorded, and where did it come from?</p>
        </div>
        <div data-signal="readiness">
          <ModelSignalGlyph kind="readiness" />
          <h3>Test Readiness</h3>
          <p>Can an approved method be run on this exact model?</p>
        </div>
        <div data-signal="evidence">
          <ModelSignalGlyph kind="evidence" />
          <h3>Evidence</h3>
          <p>What accepted observations support a behavioral claim?</p>
        </div>
      </div>
    </aside>
  );
}
