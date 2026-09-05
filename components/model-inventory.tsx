export type DiscoveredModel = {
  id: string;
  name: string;
  vendor: string;
  apiModelId: string | null;
  releaseState: string;
  apiState: string;
  accountAccess: string;
  accountCheckedOn: string | null;
  discoveredOn: string;
  releasedOn: string | null;
  firstTestedOn: string | null;
  lastTestedOn: string | null;
  eligibility: string;
  eligibilityReasons: string[];
  testing: string;
  sources: string[];
  reviewReasons: string[];
};
const label = (value: string) => value.replaceAll('_', ' ');
export function ModelInventory({ models }: { models: DiscoveredModel[] }) {
  const vendors = [...new Set(models.map((model) => model.vendor))].sort();
  return (
    <section
      className="monitor-section model-inventory"
      id="models"
      aria-labelledby="models-title"
    >
      <div className="section-heading">
        <div>
          <p className="section-code">MODEL REGISTER</p>
          <h2 id="models-title">Discovered models</h2>
        </div>
        <p>
          Model existence is separate from temporal evidence. API metadata does
          not describe a consumer product. Absence from this register does not
          establish that a model does not exist.
        </p>
      </div>
      <p>
        {models.length} reviewed model entries ·{' '}
        {models.filter((m) => m.testing !== 'TESTED').length} not yet tested by
        an approved API protocol.
      </p>
      {!models.length && (
        <p>
          Discovery candidates are awaiting catalog review. The dated
          observations below remain unchanged.
        </p>
      )}
      <p>
        <a href="https://github.com/diegolinan/eternal-tuesday-monitor/pulls">
          Review proposed catalog additions
        </a>
      </p>
      {vendors.map((vendor) => (
        <details key={vendor} className="model-vendor">
          <summary>
            {vendor} · {models.filter((m) => m.vendor === vendor).length} model
            entries
          </summary>
          <div className="model-register-grid">
            {models
              .filter((m) => m.vendor === vendor)
              .map((model) => (
                <article key={model.id} className="model-register-card">
                  <h3>{model.name}</h3>
                  <p>
                    {label(model.releaseState)} · {label(model.testing)}
                  </p>
                  <dl>
                    <dt>API identity</dt>
                    <dd>{model.apiModelId ?? 'Not established'}</dd>
                    <dt>API status</dt>
                    <dd>{label(model.apiState)}</dd>
                    <dt>Account access, last check</dt>
                    <dd>
                      {label(model.accountAccess)}
                      {model.accountCheckedOn
                        ? ` · ${model.accountCheckedOn}`
                        : ''}
                    </dd>
                    <dt>Probe readiness</dt>
                    <dd>{label(model.eligibility)}</dd>
                    <dt>Discovered</dt>
                    <dd>{model.discoveredOn}</dd>
                    <dt>Vendor release date</dt>
                    <dd>{model.releasedOn ?? 'Not established'}</dd>
                    {model.firstTestedOn && (
                      <>
                        <dt>First accepted API test</dt>
                        <dd>{model.firstTestedOn}</dd>
                      </>
                    )}
                  </dl>
                  {model.testing !== 'TESTED' && (
                    <p>
                      No accepted temporal probe evidence for this API identity.
                      No PASS or FAIL is assigned.
                    </p>
                  )}
                  <details>
                    <summary>Provenance and readiness</summary>
                    {model.reviewReasons.length > 0 && (
                      <p>
                        Identity/source review:{' '}
                        {model.reviewReasons.map(label).join('; ')}
                      </p>
                    )}
                    <ul>
                      {model.eligibilityReasons.map((reason) => (
                        <li key={reason}>{label(reason)}</li>
                      ))}
                    </ul>
                    <ul>
                      {model.sources.map((url, i) => (
                        <li key={url}>
                          <a href={url} target="_blank" rel="noreferrer">
                            Official source {i + 1}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                </article>
              ))}
          </div>
        </details>
      ))}
    </section>
  );
}
