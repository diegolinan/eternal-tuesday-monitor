'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { withBasePath } from '@/lib/site-paths';

export const dynamic = 'force-static';

type ChangeEvent = {
  id: string;
  recorded_on: string;
  type: string;
  title: string;
  summary: string;
  source: string;
  subjects: Array<{ type: string; id: string; label: string }>;
  source_urls: string[];
  affects_observations: boolean;
};

const label = (value: string) => value.replaceAll('_', ' ');
const sourceLabels: Record<string, string> = {
  HUMAN_REVIEW: 'ACCEPTED AFTER HUMAN REVIEW',
  AUTOMATIC_POLICY: 'ACCEPTED BY PUBLISHED POLICY',
  RELEASE: 'MONITOR POLICY CHANGE',
};

export default function ChangelogPage() {
  const [events, setEvents] = useState<ChangeEvent[] | null>(null);

  useEffect(() => {
    fetch(withBasePath('/data/changelog.json'))
      .then((response) => {
        if (!response.ok) throw new Error('Changelog unavailable');
        return response.json() as Promise<{ events: ChangeEvent[] }>;
      })
      .then((data) => setEvents(data.events))
      .catch(() => setEvents([]));
  }, []);

  return (
    <main className="changelog-page">
      <header className="masthead">
        <a className="series-mark" href={withBasePath('/')}>
          The Eternal Tuesday Monitor
        </a>
        <nav aria-label="Changelog navigation">
          <a href={withBasePath('/')}>Monitor</a>
        </nav>
      </header>
      <section className="changelog-hero">
        <p className="eyebrow">PUBLIC RECORD · DOMAIN CHANGES ONLY</p>
        <h1>Monitor changelog</h1>
        <p>
          Accepted domain changes only: official model identities, eligibility
          decisions, behavioral evidence, and observation status. A routine
          source scan with no accepted change creates no entry. Software changes
          are excluded.
        </p>
      </section>
      <section className="changelog-list" aria-live="polite">
        {events === null && <p>Reading the public change ledger…</p>}
        {events?.length === 0 && (
          <p>The public change ledger is unavailable.</p>
        )}
        {events?.map((event) => (
          <article key={event.id}>
            <div className="change-date">
              <time dateTime={event.recorded_on}>{event.recorded_on}</time>
              <span>{label(event.type)}</span>
            </div>
            <div>
              <h2>{event.title}</h2>
              <p>{event.summary}</p>
              <p className="change-scope">
                {event.affects_observations
                  ? 'OBSERVATION DATA CHANGED'
                  : 'NO OBSERVATION VERDICT CHANGED'}{' '}
                · {sourceLabels[event.source] ?? label(event.source)}
              </p>
              <ul>
                {event.subjects.map((subject) => (
                  <li key={`${event.id}-${subject.id}`}>{subject.label}</li>
                ))}
              </ul>
              <div className="change-links">
                {event.source_urls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    Official source <ExternalLink aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
