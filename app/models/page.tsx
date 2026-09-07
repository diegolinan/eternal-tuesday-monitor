'use client';

import {
  ModelInventory,
  type DiscoveredModel,
  type ModelOperationalStatus,
} from '@/components/model-inventory';
import { withBasePath } from '@/lib/site-paths';
import monitorSnapshot from '@/public/data/monitor.json';
import modelOperationsSnapshot from '@/public/data/model-operations.json';

export const dynamic = 'force-static';

export default function ModelsPage() {
  return (
    <main className="models-page" id="main-content">
      <header className="masthead">
        <a className="series-mark" href={withBasePath('/')}>
          The Eternal Tuesday Monitor
        </a>
        <nav aria-label="Model register navigation">
          <a href={withBasePath('/')}>Findings</a>
          <a href={withBasePath('/changelog/')}>Changes</a>
          <a href={withBasePath('/contribute/')}>Contribute</a>
        </nav>
      </header>
      <section className="models-intro">
        <p className="eyebrow">SECONDARY REFERENCE · EXACT IDENTITIES</p>
        <h1>Model register</h1>
        <p>
          Listing, test readiness and behavioral evidence answer different
          questions. A model appearing here does not mean that it is available
          in a product, has been tested, or passed any probe.
        </p>
      </section>
      <ModelInventory
        models={monitorSnapshot.models as DiscoveredModel[]}
        operations={modelOperationsSnapshot.models as ModelOperationalStatus[]}
      />
    </main>
  );
}
