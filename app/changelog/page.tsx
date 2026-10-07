'use client';

import { ExternalLink } from 'lucide-react';
import { useViewUrl } from '@/components/use-view-url';
import { CopyViewLink, Permalink } from '@/components/share-links';
import { readChangeType } from '@/lib/view-links.mjs';
import { withBasePath } from '@/lib/site-paths';
import { sourceLinks } from '@/lib/source-links.mjs';
import { groupChanges } from '@/lib/changelog-view.mjs';
import changelogSnapshot from '@/public/data/changelog.json';

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
  const events = changelogSnapshot.events as ChangeEvent[];
  const view = useViewUrl();
  const types = [...new Set(events.map((event) => event.type))].sort();
  const type = readChangeType(view.search, types);
  const linkTo = (id: string) => `#${encodeURIComponent(id)}`;
  const groups = groupChanges(events, type) as {
    date: string;
    events: ChangeEvent[];
  }[];
  const visibleCount = groups.reduce(
    (count, group) => count + group.events.length,
    0,
  );

  return (
    <main className="changelog-page" id="main-content" tabIndex={-1}>
      <header className="masthead">
        <a className="series-mark" href={withBasePath('/')}>
          The Eternal Tuesday Monitor
        </a>
        <nav aria-label="Changelog navigation">
          <a href={withBasePath('/')}>Monitor</a>
          <a href={withBasePath('/contributors/')}>Clockkeepers</a>
          <a href={withBasePath('/contribute/')}>Contribute</a>
        </nav>
      </header>
      <section className="changelog-hero">
        <p className="eyebrow">PUBLIC RECORD · DOMAIN CHANGES ONLY</p>
        <h1>Monitor Changelog</h1>
        <p>
          Accepted changes to identities, policy and evidence. A routine source
          scan with no accepted change creates no entry. Software changes are
          excluded.
        </p>
      </section>
      <div className="change-register-controls">
        <div>
          <span className="section-code">DATED ENTRIES / NOT A LIVE FEED</span>
          <output aria-live="polite">
            {visibleCount} of {events.length} changes · {groups.length} date
            {groups.length === 1 ? '' : 's'}
          </output>
        </div>
        <label>
          Filter by change type
          <select
            disabled={!view.ready}
            value={type}
            onChange={(event) =>
              view.update({
                type: event.target.value === 'ALL' ? null : event.target.value,
              })
            }
            aria-controls="change-register"
          >
            <option value="ALL">All change types</option>
            {types.map((value) => (
              <option key={value} value={value}>
                {label(value)} (
                {events.filter((event) => event.type === value).length})
              </option>
            ))}
          </select>
        </label>
        <CopyViewLink key={view.snapshot} disabled={!view.ready} />
      </div>
      <section
        className="changelog-list"
        id="change-register"
        aria-label="Changes grouped by date"
      >
        {events.length === 0 && (
          <p>No accepted domain changes are published for this release.</p>
        )}
        {groups.map((group) => (
          <section
            className="change-day"
            key={group.date}
            aria-labelledby={`date-${group.date}`}
          >
            <header className="change-day-heading">
              <h2 id={`date-${group.date}`}>
                <time dateTime={group.date}>
                  <b>{group.date.slice(8)}</b>
                  <span>{group.date.slice(0, 7)}</span>
                </time>
              </h2>
              <span>
                {group.events.length} ENTR
                {group.events.length === 1 ? 'Y' : 'IES'}
              </span>
              <Permalink
                href={linkTo(`date-${group.date}`)}
                label={`changes on ${group.date}`}
              />
              <div className="ledger-registration" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
            </header>
            <div className="change-day-entries">
              {group.events.map((event) => (
                <article key={event.id} id={event.id}>
                  <div className="change-date">
                    <span>{label(event.type)}</span>
                    <Permalink href={linkTo(event.id)} label={event.title} />
                  </div>
                  <div>
                    <h3>{event.title}</h3>
                    <p>{event.summary}</p>
                    <p className="change-scope">
                      {event.affects_observations
                        ? 'OBSERVATION DATA CHANGED'
                        : 'NO OBSERVATION VERDICT CHANGED'}{' '}
                      · {sourceLabels[event.source] ?? label(event.source)}
                    </p>
                    <ul>
                      {event.subjects.map((subject) => (
                        <li key={`${event.id}-${subject.id}`}>
                          {subject.label}
                        </li>
                      ))}
                    </ul>
                    <div className="change-links">
                      {sourceLinks(event.source_urls).map(({ url, label }) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {label} <ExternalLink aria-hidden="true" />
                        </a>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </section>
    </main>
  );
}
