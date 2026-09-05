'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';

type ProbeCoverage = {
  id: string;
  name: string;
  state: 'NOT_TESTED' | 'TESTED' | 'RETEST_REQUIRED';
};

export type DiscoveredModel = {
  id: string;
  name: string;
  vendor: string;
  apiModelId: string | null;
  releaseState: string;
  relevanceState: string;
  apiState: string;
  accountAccess: string;
  accountCheckedOn: string | null;
  discoveredOn: string | null;
  releasedOn: string | null;
  firstTestedOn: string | null;
  lastTestedOn: string | null;
  lifecycleState:
    | 'DISCOVERED'
    | 'EVALUATION_PENDING'
    | 'EVALUATION_AVAILABLE'
    | 'EVALUATION_NOT_POSSIBLE'
    | 'TESTED'
    | 'RETEST_REQUIRED';
  testabilityState:
    | 'AVAILABLE'
    | 'NOT_CURRENTLY_AVAILABLE'
    | 'UNKNOWN_REVIEW_REQUIRED';
  evaluationReasons: string[];
  probeCoverage: ProbeCoverage[];
  surfaces: Array<{
    id: string;
    product: string;
    name: string;
    kind: 'PROVIDER_API' | 'CONSUMER_PRODUCT_SURFACE';
  }>;
  sources: string[];
  reviewReasons: string[];
  defaultProminence: boolean;
};

const label = (value: string) => value.replaceAll('_', ' ');
const reasonLabels: Record<string, string> = {
  API_UNKNOWN: 'API availability has not been established',
  API_PENDING: 'The provider documents API access as pending',
  ACCOUNT_ACCESS_NOT_CONFIRMED: 'Account access has not been confirmed',
  ACCOUNT_ACCESS_CHECK_STALE: 'The latest account access check is stale',
  NO_APPROVED_EXECUTABLE_METHODOLOGY:
    'No provider methodology is approved for automatic execution',
  IDENTITY_OR_SOURCE_REVIEW_REQUIRED:
    'Identity or source metadata requires review',
  MODEL_LIFECYCLE_BLOCKED: 'The official model lifecycle blocks evaluation',
  ENDPOINT_OR_PARAMETERS_UNSUPPORTED:
    'The approved harness is incompatible with the documented API surface',
  ACCESS_DENIED: 'The configured account does not have access',
  ERROR: 'The latest access check failed',
};

function LifecycleCard({ model }: { model: DiscoveredModel }) {
  return (
    <article
      className={`coverage-card state-${model.lifecycleState.toLowerCase()}`}
    >
      <header>
        <span>{model.vendor}</span>
        <strong>{label(model.lifecycleState)}</strong>
      </header>
      <div className="coverage-card-body">
        <h3>{model.name}</h3>
        <p className="coverage-verdict">NO VERDICT IMPLIED</p>
        <dl>
          <div>
            <dt>Canonical API ID</dt>
            <dd>{model.apiModelId ?? 'Not established'}</dd>
          </div>
          <div>
            <dt>Discovered</dt>
            <dd>{model.discoveredOn ?? 'Not established'}</dd>
          </div>
          <div>
            <dt>API availability</dt>
            <dd>{label(model.apiState)}</dd>
          </div>
          <div>
            <dt>Testability</dt>
            <dd>{label(model.testabilityState)}</dd>
          </div>
          <div>
            <dt>Reviewed relevance</dt>
            <dd>{label(model.relevanceState)}</dd>
          </div>
        </dl>
        <div
          className="probe-coverage"
          aria-label={`${model.name} probe coverage`}
        >
          {model.probeCoverage.map((probe) => (
            <div key={probe.id}>
              <span>{probe.name}</span>
              <b>{label(probe.state)}</b>
            </div>
          ))}
        </div>
        <details>
          <summary>Evidence boundary and provenance</summary>
          <p>
            {model.evaluationReasons.length
              ? model.evaluationReasons
                  .map((reason) => reasonLabels[reason] ?? label(reason))
                  .join('. ')
              : 'No mechanical blocker is currently recorded.'}
          </p>
          {model.surfaces.length ? (
            <ul>
              {model.surfaces.map((surface) => (
                <li key={surface.id}>
                  {surface.product} / {surface.name} · {label(surface.kind)}
                </li>
              ))}
            </ul>
          ) : (
            <p>No product surface is inferred from catalog or API metadata.</p>
          )}
          {model.sources.length ? (
            <ul>
              {model.sources.map((url, index) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noreferrer">
                    Official discovery source {index + 1}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p>This manually curated identity has no discovery-event source.</p>
          )}
        </details>
      </div>
    </article>
  );
}

export function ModelInventory({ models }: { models: DiscoveredModel[] }) {
  const [scope, setScope] = useState<'focus' | 'all'>('focus');
  const [query, setQuery] = useState('');
  const [vendor, setVendor] = useState('ALL');
  const vendors = [...new Set(models.map((model) => model.vendor))].sort();
  const counts = models.reduce<Record<string, number>>((result, model) => {
    result[model.lifecycleState] = (result[model.lifecycleState] ?? 0) + 1;
    return result;
  }, {});
  const visible = (() => {
    const needle = query.trim().toLowerCase();
    return models.filter((model) => {
      const focused = model.defaultProminence;
      const matchesText =
        !needle ||
        `${model.name} ${model.vendor} ${model.apiModelId ?? ''}`
          .toLowerCase()
          .includes(needle);
      return (
        (scope === 'all' || focused || Boolean(needle)) &&
        (vendor === 'ALL' || model.vendor === vendor) &&
        matchesText
      );
    });
  })();
  const displayed = visible.slice(0, 24);
  const newOrPending = models.filter(
    (model) =>
      model.defaultProminence &&
      ['DISCOVERED', 'EVALUATION_PENDING', 'EVALUATION_AVAILABLE'].includes(
        model.lifecycleState,
      ),
  ).length;

  return (
    <section
      className="monitor-section model-inventory"
      id="models"
      aria-labelledby="models-title"
    >
      <div className="section-heading">
        <div>
          <p className="section-code">MODEL COVERAGE</p>
          <h2 id="models-title">What the Monitor knows</h2>
        </div>
        <p>
          Catalog existence and empirical evidence are different records. An API
          identity never proves behavior in ChatGPT or another consumer product.
        </p>
      </div>

      <div className="coverage-summary" aria-label="Model lifecycle counts">
        <div>
          <strong>{counts.TESTED ?? 0}</strong>
          <span>Tested</span>
        </div>
        <div>
          <strong>{newOrPending}</strong>
          <span>New / evaluation pending</span>
        </div>
        <div>
          <strong>{counts.RETEST_REQUIRED ?? 0}</strong>
          <span>Retest required</span>
        </div>
        <div className="coverage-known">
          <strong>{models.length}</strong>
          <span>Known catalog identities</span>
        </div>
      </div>

      <div className="coverage-controls">
        <div className="coverage-scope" aria-label="Model coverage scope">
          <button
            type="button"
            aria-pressed={scope === 'focus'}
            onClick={() => setScope('focus')}
          >
            Evidence focus
          </button>
          <button
            type="button"
            aria-pressed={scope === 'all'}
            onClick={() => setScope('all')}
          >
            All known models
          </button>
        </div>
        <label className="coverage-search">
          <span>Find a model or API ID</span>
          <div>
            <Search aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the accepted catalog"
            />
          </div>
        </label>
        <label className="coverage-vendor">
          <span>Vendor</span>
          <select
            value={vendor}
            onChange={(event) => setVendor(event.target.value)}
          >
            <option value="ALL">All vendors</option>
            {vendors.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="coverage-explainer">
        Evidence focus shows tested, retest, evaluation-ready, or explicitly
        policy-classified relevant models. Catalog-only variants remain
        searchable without dominating the default view. Frontier status is never
        guessed from a name or version.
      </p>
      <p className="coverage-result-count">
        Showing {displayed.length} of {visible.length} matching models.
      </p>
      {displayed.length ? (
        <div className="model-register-grid">
          {displayed.map((model) => (
            <LifecycleCard key={model.id} model={model} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span>NO MATCHING MODEL</span>
          <p>
            Try the full catalog, another vendor, or a model/API identifier.
          </p>
        </div>
      )}
    </section>
  );
}
