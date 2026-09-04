'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RotateCcw, Search, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { withBasePath } from '@/lib/site-paths';

export const dynamic = 'force-static';

type Observation = {
  id: string;
  vendor: string;
  product: string;
  surface: string;
  model: string;
  probe: string;
  resultStatus: string;
  evidenceClass: string;
  observedDate: string;
  lastVerified: string;
  sourceUrl: string;
  evidenceNote: string;
  recordState: string[];
  methodologyVersion: string;
};

type MonitorData = {
  schemaVersion: string;
  monitorName: string;
  dataCutoff: string;
  methodologyVersion: string;
  articlePath: string;
  observations: Observation[];
};

const probes = [
  {
    number: '01',
    family: 'TEMPORAL TESTS',
    name: 'TEMPORAL ANCHOR',
    description:
      'Can this specific product surface correctly establish the relevant "now" and reference frame when the task requires it?',
  },
  {
    number: '02',
    family: 'TEMPORAL TESTS',
    name: 'ELAPSED',
    description:
      'Can it correctly account for meaningful real-world time between relevant interactions or events?',
  },
  {
    number: '03',
    family: 'TEMPORAL TESTS',
    name: 'REVALIDATION',
    description:
      'Can it recognize when retained information may no longer be safe to reuse and obtain appropriate current evidence?',
  },
  {
    number: '04',
    family: 'ADJACENT STATE TESTS',
    name: 'STATE RECONCILIATION',
    description:
      'When new evidence changes operative state, does the system act on the updated state rather than a superseded one?',
  },
  {
    number: '05',
    family: 'ADJACENT STATE TESTS',
    name: 'HISTORICAL VALIDITY',
    description:
      'Can it preserve what was previously valid without treating it as what is valid now?',
  },
];

const evidenceGroups = [
  {
    label: 'DIRECTLY OBSERVED',
    note: 'A defined test or repeatable observation. Scope still belongs to the tested conditions.',
    classes: ['CONTROLLED EXPERIMENT', 'REPRODUCED OBSERVATION'],
  },
  {
    label: 'PROVIDER-SUPPLIED',
    note: 'Useful evidence about documented behavior or provider findings. Not independent proof of resolution.',
    classes: [
      'OFFICIAL DOCUMENTATION',
      'VENDOR EVALUATION',
      'STAFF CONFIRMATION',
    ],
  },
  {
    label: 'REPORTED OR REQUESTED',
    note: 'A surface-level report or request. It may identify a real symptom without proving its mechanism.',
    classes: ['USER / PRACTITIONER REPORT', 'FEATURE REQUEST'],
  },
  {
    label: 'EVIDENCE GAP',
    note: 'No qualifying public result was found at the cutoff. This is not a FAIL.',
    classes: ['UNTESTED / NO PUBLIC EVIDENCE'],
  },
];

function labelDate(date: string) {
  return new Date(`${date}T00:00:00Z`)
    .toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
    .toUpperCase();
}

function recordTone(item: Observation) {
  if (item.recordState.includes('RETEST REQUIRED')) return 'retest';
  if (item.resultStatus === 'NO PUBLIC EVIDENCE') return 'empty';
  if (item.resultStatus === 'OBSERVED FAILURE') return 'failure';
  if (item.evidenceClass === 'CONTROLLED EXPERIMENT') return 'controlled';
  return 'documented';
}

function ObservationCard({
  item,
  onOpen,
}: {
  item: Observation;
  onOpen: (item: Observation) => void;
}) {
  return (
    <article className={`observation-card tone-${recordTone(item)}`}>
      <div className="status-bar">
        <span>{item.vendor}</span>
        <strong>{item.resultStatus}</strong>
      </div>
      <div className="card-core">
        <p className="scope-line">{item.product}</p>
        <h3>{item.surface}</h3>
        <p className="model-line">MODEL · {item.model}</p>
      </div>
      <dl>
        <div>
          <dt>Probe</dt>
          <dd>{item.probe}</dd>
        </div>
        <div>
          <dt>Evidence class</dt>
          <dd>{item.evidenceClass}</dd>
        </div>
        <div className="verified">
          <dt>Last verified</dt>
          <dd>{item.lastVerified}</dd>
        </div>
      </dl>
      <button
        className="inspect-button"
        type="button"
        onClick={() => onOpen(item)}
      >
        Inspect record <Search aria-hidden="true" />
      </button>
      {item.recordState.includes('RETEST REQUIRED') && (
        <span className="retest-flag">RETEST REQUIRED</span>
      )}
    </article>
  );
}

function ObservationList({
  items,
  onOpen,
}: {
  items: Observation[];
  onOpen: (item: Observation) => void;
}) {
  if (!items.length) {
    return (
      <div className="empty-state">
        <span>NO MATCHING SIGNAL</span>
        <p>
          The current controls produce no observation. Absence remains visible.
        </p>
      </div>
    );
  }

  return (
    <div className="observation-grid">
      {items.map((item) => (
        <ObservationCard item={item} key={item.id} onOpen={onOpen} />
      ))}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="filter-control">
      <span>{label}</span>
      <Select value={value} onValueChange={(next) => onChange(next ?? 'ALL')}>
        <SelectTrigger aria-label={`Filter by ${label}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectItem value="ALL">ALL</SelectItem>
          {options.map((option) => (
            <SelectItem value={option} key={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export default function Home() {
  const [data, setData] = useState<MonitorData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [vendor, setVendor] = useState('ALL');
  const [surface, setSurface] = useState('ALL');
  const [probe, setProbe] = useState('ALL');
  const [evidence, setEvidence] = useState('ALL');
  const [selected, setSelected] = useState<Observation | null>(null);

  useEffect(() => {
    fetch(withBasePath('/data/monitor.json'))
      .then((response) => {
        if (!response.ok) throw new Error('Observation data unavailable');
        return response.json();
      })
      .then((value) => setData(value as MonitorData))
      .catch(() => setLoadError(true));
  }, []);

  const observations = useMemo(() => data?.observations ?? [], [data]);
  const vendors = useMemo(
    () => [...new Set(observations.map((item) => item.vendor))].sort(),
    [observations],
  );
  const surfaces = useMemo(
    () =>
      [
        ...new Set(
          observations.map((item) => `${item.product} / ${item.surface}`),
        ),
      ].sort(),
    [observations],
  );
  const probeOptions = probes.map((item) => item.name);
  const evidenceOptions = evidenceGroups.flatMap((group) => group.classes);

  const applyFilters = (items: Observation[]) =>
    items.filter(
      (item) =>
        (vendor === 'ALL' || item.vendor === vendor) &&
        (surface === 'ALL' ||
          `${item.product} / ${item.surface}` === surface) &&
        (probe === 'ALL' || item.probe === probe) &&
        (evidence === 'ALL' || item.evidenceClass === evidence),
    );

  const current = applyFilters(
    observations.filter((item) => item.recordState.includes('CURRENT')),
  );
  const historical = applyFilters(
    observations.filter((item) => item.recordState.includes('HISTORICAL')),
  );
  const hasFilters = [vendor, surface, probe, evidence].some(
    (value) => value !== 'ALL',
  );
  const resetFilters = () => {
    setVendor('ALL');
    setSurface('ALL');
    setProbe('ALL');
    setEvidence('ALL');
  };

  const historyGroups = useMemo(() => {
    const groups = new Map<string, Observation[]>();
    observations
      .filter((item) => item.recordState.includes('HISTORICAL'))
      .forEach((item) => {
        const key = `${item.vendor}|${item.product}|${item.surface}|${item.probe}`;
        groups.set(key, [...(groups.get(key) ?? []), item]);
      });
    return [...groups.entries()];
  }, [observations]);

  return (
    <main>
      <header className="masthead">
        <a className="series-mark" href="#methodology">
          Operational AI Literacy
        </a>
        <nav aria-label="Primary navigation">
          <a href="#observations">Observations</a>
          <a href="#probes">Five probes</a>
          <a href="#history">History</a>
          <a href="#evidence">Evidence</a>
          <a href="#methodology">Methodology</a>
        </nav>
      </header>

      <section className="hero" aria-labelledby="page-title">
        <div className="hero-copy">
          <p className="eyebrow">Public observation station · ETM-1.0</p>
          <h1 id="page-title">
            The Eternal
            <br />
            Tuesday Monitor
          </h1>
          <p className="hero-lede">
            A persistent conversation can preserve continuity while the world
            outside it changes.
          </p>
          <p className="hero-note">
            The Monitor tracks what we can actually verify about temporal
            continuity in current AI products. It is dated evidence, not a
            permanent ranking.
          </p>
          <div className="cutoff-plate">
            <span>Current data cutoff</span>
            <strong>{data ? labelDate(data.dataCutoff) : '03 SEP 2026'}</strong>
          </div>
        </div>
        <figure className="hero-visual">
          <img
            src={withBasePath('/assets/monitor-exhibit.png')}
            alt="A period-styled Eternal Tuesday Monitor control console with gauges and evidence labels"
          />
          <figcaption>OBSERVABLE PROBES - NOT INTERNAL ARCHITECTURE</figcaption>
        </figure>
      </section>

      <section
        className="monitor-section"
        id="observations"
        aria-labelledby="current-title"
      >
        <div className="section-heading">
          <div>
            <p className="section-code">STATION 01</p>
            <h2 id="current-title">Current observations</h2>
          </div>
          <p>
            Most recent valid records at the cutoff. Product behavior, evidence
            class and date are kept separate. No overall score is calculated.
          </p>
        </div>

        <div className="filter-console" aria-label="Observation filters">
          <div className="console-title">
            <span>Product / surface selector</span>
            <small>REF · ETM-CONTROL-5</small>
          </div>
          <div className="filters">
            <FilterSelect
              label="Vendor"
              value={vendor}
              options={vendors}
              onChange={setVendor}
            />
            <FilterSelect
              label="Product / surface"
              value={surface}
              options={surfaces}
              onChange={setSurface}
            />
            <FilterSelect
              label="Probe"
              value={probe}
              options={probeOptions}
              onChange={setProbe}
            />
            <FilterSelect
              label="Evidence class"
              value={evidence}
              options={evidenceOptions}
              onChange={setEvidence}
            />
            <button
              className="reset-button"
              type="button"
              onClick={resetFilters}
              disabled={!hasFilters}
            >
              <RotateCcw aria-hidden="true" /> Reset
            </button>
          </div>
          <div className="console-rule">
            <strong>CAUTION</strong>
            <span>
              A model API result does not automatically describe a consumer
              product surface.
            </span>
          </div>
        </div>

        {loadError ? (
          <div className="empty-state">
            <span>DATA FEED UNAVAILABLE</span>
            <p>
              The exhibit remains intact, but the observation file could not be
              read.
            </p>
          </div>
        ) : !data ? (
          <output className="loading-panel">
            <i />
            <span>READING DATED RECORDS</span>
          </output>
        ) : (
          <Tabs defaultValue="current" className="scope-tabs">
            <TabsList variant="line" aria-label="Observation scope">
              <TabsTrigger value="current">
                CURRENT · {current.length}
              </TabsTrigger>
              <TabsTrigger value="historical">
                HISTORICAL · {historical.length}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="current">
              <ObservationList items={current} onOpen={setSelected} />
            </TabsContent>
            <TabsContent value="historical">
              <ObservationList items={historical} onOpen={setSelected} />
            </TabsContent>
          </Tabs>
        )}
      </section>

      <section
        className="probe-section"
        id="probes"
        aria-labelledby="probes-title"
      >
        <div className="section-heading section-heading-light">
          <div>
            <p className="section-code">STATION 02</p>
            <h2 id="probes-title">The five probes</h2>
          </div>
          <p>
            Five black-box diagnostic questions. They are not five components
            inside a product, and they were not derived from one benchmark.
          </p>
        </div>
        <div className="probe-family">
          <div className="family-label">
            <span>Experimental backbone</span>
            <h3>TEMPORAL TESTS</h3>
            <b>03 PROBES</b>
          </div>
          <div className="probe-cards probe-three">
            {probes.slice(0, 3).map((item) => (
              <article className="probe-card" key={item.name}>
                <span>{item.number}</span>
                <h3>{item.name}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>
        <div className="probe-family adjacent-family">
          <div className="family-label">
            <span>Deliberate extension</span>
            <h3>ADJACENT STATE TESTS</h3>
            <b>02 PROBES</b>
          </div>
          <div className="probe-cards probe-two">
            {probes.slice(3).map((item) => (
              <article className="probe-card" key={item.name}>
                <span>{item.number}</span>
                <h3>{item.name}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>
        <figure className="wide-figure">
          <img
            src={withBasePath('/assets/diagnostic-panel.png')}
            alt="A mid-century service diagram showing five external diagnostic probes connected to a conversational continuity unit"
          />
          <figcaption>
            FIG. 7-2 · EXTERNAL DIAGNOSTIC PROBES FOR OBSERVABLE BEHAVIOR ONLY
          </figcaption>
        </figure>
      </section>

      <section
        className="product-section"
        id="products"
        aria-labelledby="products-title"
      >
        <div className="section-heading">
          <div>
            <p className="section-code">STATION 03</p>
            <h2 id="products-title">Product / surface view</h2>
          </div>
          <p>
            Vendor, product, surface and model remain separate coordinates.
            Unknown fields remain unknown.
          </p>
        </div>
        <div
          className="coordinate-diagram"
          aria-label="Product record field separation"
        >
          <div>
            <span>VENDOR</span>
            <strong>OPENAI</strong>
          </div>
          <i aria-hidden="true">→</i>
          <div>
            <span>PRODUCT</span>
            <strong>CHATGPT</strong>
          </div>
          <i aria-hidden="true">→</i>
          <div>
            <span>SURFACE</span>
            <strong>PROJECTS</strong>
          </div>
          <i aria-hidden="true">→</i>
          <div>
            <span>MODEL</span>
            <strong>GPT-5.6 SOL</strong>
          </div>
        </div>
        <p className="separation-note">
          This record is not interchangeable with OPENAI / API / MODEL API /
          GPT-5.6 SOL.
        </p>
      </section>

      <section
        className="history-section"
        id="history"
        aria-labelledby="history-title"
      >
        <div className="section-heading section-heading-light">
          <div>
            <p className="section-code">STATION 04</p>
            <h2 id="history-title">Observation history</h2>
          </div>
          <p>
            New evidence may supersede operative state. It does not erase what
            was observed before.
          </p>
        </div>
        <div className="history-principle">
          <span>HISTORICAL VALIDITY APPLIED TO THE MONITOR ITSELF</span>
          <strong>A March failure is not a permanent FAIL.</strong>
        </div>
        <div className="timeline-list">
          {historyGroups.map(([key, items]) => {
            const first = items[0];
            return (
              <article className="timeline-group" key={key}>
                <header>
                  <span>{first.vendor}</span>
                  <h3>
                    {first.product} / {first.surface}
                  </h3>
                  <b>{first.probe}</b>
                </header>
                <div className="timeline-track">
                  {items.map((item) => (
                    <button
                      type="button"
                      className="timeline-stop"
                      key={item.id}
                      onClick={() => setSelected(item)}
                    >
                      <i aria-hidden="true" />
                      <span>{item.observedDate}</span>
                      <strong>{item.resultStatus}</strong>
                      <small>{item.evidenceClass}</small>
                    </button>
                  ))}
                  <div className="timeline-open-end">
                    <span>NEXT VALID RETEST</span>
                    <strong>UNKNOWN</strong>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section
        className="evidence-section"
        id="evidence"
        aria-labelledby="evidence-title"
      >
        <div className="section-heading">
          <div>
            <p className="section-code">STATION 05</p>
            <h2 id="evidence-title">Evidence class</h2>
          </div>
          <p>
            Capability status answers what was observed. Evidence class answers
            what supports that statement. They are not the same field.
          </p>
        </div>
        <div className="evidence-grid">
          {evidenceGroups.map((group, index) => (
            <article className="evidence-module" key={group.label}>
              <span className="module-number">
                E-{String(index + 1).padStart(2, '0')}
              </span>
              <h3>{group.label}</h3>
              <p>{group.note}</p>
              <ul>
                {group.classes.map((item) => (
                  <li key={item}>
                    <i aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <div className="evidence-cautions">
          <p>
            VENDOR CLAIM <b>≠</b> INDEPENDENT PROOF OF RESOLUTION
          </p>
          <p>
            USER REPORT <b>≠</b> PROOF OF MECHANISM
          </p>
          <p>
            BENCHMARK RESULT <b>≠</b> LATER CONSUMER PRODUCT
          </p>
        </div>
      </section>

      <section
        className="method-section"
        id="methodology"
        aria-labelledby="method-title"
      >
        <div className="method-visual">
          <img
            src={withBasePath('/assets/same-sequence-different-time.png')}
            alt="A split period illustration showing the same conversation after 30 seconds and after 72 hours"
          />
        </div>
        <div className="method-copy">
          <p className="section-code">STATION 06 · METHOD ETM-1.0</p>
          <h2 id="method-title">Methodology</h2>
          <p className="method-lede">
            Conversation order preserves sequence. It does not necessarily
            preserve elapsed time.
          </p>
          <ol>
            <li>
              <span>01</span>
              <div>
                <h3>Observe the surface</h3>
                <p>
                  The Monitor records observable product behavior. It does not
                  claim to measure cognition or infer internal architecture.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Bind the result</h3>
                <p>
                  Every result belongs to a vendor, product, surface, known
                  model, probe, date, evidence class and methodology version.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Check the age</h3>
                <p>
                  LAST VERIFIED is part of the result. A stale observation
                  becomes RETEST REQUIRED rather than quietly remaining current.
                </p>
              </div>
            </li>
            <li>
              <span>04</span>
              <div>
                <h3>Keep the history</h3>
                <p>
                  A historical failure is evidence about an earlier state. It is
                  not automatically a claim about current behavior.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="why-section" id="why" aria-labelledby="why-title">
        <div className="why-copy">
          <p className="section-code">EDITORIAL NOTE</p>
          <h2 id="why-title">Why this exists</h2>
          <blockquote>
            <span>The conversation continued.</span>
            <strong>The world didn&apos;t wait.</strong>
          </blockquote>
          <p>
            Publication freezes an observation. Products do not freeze with it.
            The Monitor keeps dated claims inspectable while the systems beneath
            them change.
          </p>
          <p>
            Once upon a time in the future, this monitor was completely boring.
          </p>
          <p className="dry-note">That is the desired operating condition.</p>
        </div>
        <figure>
          <img
            src={withBasePath('/assets/eternal-tuesday-banner.png')}
            alt="A mid-century advertisement for a continuity computer under clocks labeled Tuesday, Monday and Saturday"
          />
          <figcaption>PUBLIC CONTINUITY EXHIBIT · MODEL CCU-58</figcaption>
        </figure>
      </section>

      <section
        className="source-section"
        id="article"
        aria-labelledby="source-title"
      >
        <div>
          <p className="section-code">SOURCE / ARTICLE</p>
          <h2 id="source-title">Your AI Lives in an Eternal Tuesday</h2>
        </div>
        <div className="source-copy">
          <p>
            The full article is the conceptual and evidentiary source for this
            first Monitor release. Its citations remain source notes, not
            automatic current-status records.
          </p>
          <a
            className="article-link"
            href={withBasePath(data?.articlePath ?? '/article/')}
          >
            Read the full article <ExternalLink aria-hidden="true" />
          </a>
        </div>
      </section>

      <footer>
        <span>THE ETERNAL TUESDAY MONITOR</span>
        <span>
          DATA CUTOFF · {data ? labelDate(data.dataCutoff) : '03 SEP 2026'}
        </span>
        <span>NO OVERALL SCORE ISSUED</span>
      </footer>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="record-dialog" showCloseButton={false}>
          {selected && (
            <>
              <DialogHeader>
                <div className="dialog-kicker">
                  <span>OBSERVATION RECORD</span>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    aria-label="Close observation"
                  >
                    <X />
                  </button>
                </div>
                <DialogTitle>
                  {selected.product} / {selected.surface}
                </DialogTitle>
                <DialogDescription>
                  {selected.vendor} · {selected.model}
                </DialogDescription>
              </DialogHeader>
              <div className="record-status">
                <span>{selected.resultStatus}</span>
                {selected.recordState.map((state) => (
                  <b key={state}>{state}</b>
                ))}
              </div>
              <dl className="record-fields">
                <div>
                  <dt>Probe</dt>
                  <dd>{selected.probe}</dd>
                </div>
                <div>
                  <dt>Evidence class</dt>
                  <dd>{selected.evidenceClass}</dd>
                </div>
                <div>
                  <dt>Observed</dt>
                  <dd>{selected.observedDate}</dd>
                </div>
                <div className="dialog-verified">
                  <dt>Last verified</dt>
                  <dd>{selected.lastVerified}</dd>
                </div>
                <div>
                  <dt>Method / test version</dt>
                  <dd>{selected.methodologyVersion}</dd>
                </div>
              </dl>
              <div className="evidence-note">
                <h3>Evidence note</h3>
                <p>{selected.evidenceNote}</p>
              </div>
              <a
                className="source-link"
                href={selected.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open source <ExternalLink aria-hidden="true" />
              </a>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
