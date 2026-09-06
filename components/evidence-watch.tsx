'use client';

import { useEffect, useState } from 'react';
import { withBasePath } from '@/lib/site-paths';

type EvidenceWatchData = {
  lastSearchAt: string | null;
  state:
    | 'NOT_YET_RUN'
    | 'SEARCHED_NO_NEW_EVIDENCE'
    | 'CANDIDATES_FOUND'
    | 'PARTIAL'
    | 'SOURCE_UNAVAILABLE';
  channels: Array<{
    name: 'OFFICIAL_SOURCES' | 'PUBLIC_ISSUES' | 'RESEARCH' | 'GENERAL_WEB';
    state:
      | 'NOT_YET_RUN'
      | 'SEARCHED'
      | 'NOT_CONFIGURED'
      | 'UNAVAILABLE'
      | 'SKIPPED';
    searchedAt: string | null;
    resultsReviewed: number;
    candidatesFound: number;
    note: string;
  }>;
  candidateCounts: {
    pending: number;
    officialClaims: number;
    publicReports: number;
    researchResults: number;
  };
  latestCandidates: Array<{
    id: string;
    title: string;
    url: string;
    sourceType: string;
    claimClass: string;
    probeNames: string[];
    discoveredAt: string;
  }>;
};

const label = (value: string) => value.replaceAll('_', ' ');
const moment = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZoneName: 'short',
      }).format(new Date(value))
    : 'No completed search yet';

export function EvidenceWatch() {
  const [data, setData] = useState<EvidenceWatchData | null>(null);
  useEffect(() => {
    fetch(`${withBasePath('/data/evidence-watch.json')}?t=${Date.now()}`, {
      cache: 'no-store',
    })
      .then((response) => {
        if (!response.ok) throw new Error('Evidence watch unavailable');
        return response.json();
      })
      .then((value) => setData(value as EvidenceWatchData))
      .catch(() => setData(null));
  }, []);
  return (
    <section className="evidence-watch" aria-labelledby="evidence-watch-title">
      <div className="evidence-watch-heading">
        <p className="section-code">PUBLIC EVIDENCE WATCH</p>
        <h2 id="evidence-watch-title">Is anybody reporting a change?</h2>
        <p>
          This search looks for public claims and reports related to the five
          probes. A match becomes a review candidate—not a PASS, FAIL, or
          accepted observation.
        </p>
        <a
          className="service-station-button"
          href={withBasePath('/contribute/')}
        >
          Report a time leak
        </a>
      </div>
      <div className="evidence-watch-board">
        <div
          className={`evidence-watch-state evidence-watch-state--${(data?.state ?? 'NOT_YET_RUN').toLowerCase()}`}
        >
          <span>Latest evidence search</span>
          <strong>{label(data?.state ?? 'READING')}</strong>
          <time>{moment(data?.lastSearchAt ?? null)}</time>
          <small>Shown in your browser&apos;s local time</small>
        </div>
        <div className="evidence-watch-channels">
          {(data?.channels ?? []).map((channel) => (
            <article key={channel.name}>
              <span>{label(channel.name)}</span>
              <strong>{label(channel.state)}</strong>
              <small>
                {channel.resultsReviewed} results screened ·{' '}
                {channel.candidatesFound} candidates
              </small>
              <p>{channel.note}</p>
            </article>
          ))}
        </div>
        {!!data?.latestCandidates.length && (
          <div className="evidence-candidate-strip">
            <strong>
              {data.candidateCounts.pending} NEW CANDIDATE
              {data.candidateCounts.pending === 1 ? '' : 'S'} AWAITING REVIEW
            </strong>
            <ul>
              {data.latestCandidates.map((candidate) => (
                <li key={candidate.id}>
                  <a href={candidate.url} target="_blank" rel="noreferrer">
                    {candidate.title}
                  </a>
                  <small>
                    {label(candidate.claimClass)} ·{' '}
                    {candidate.probeNames.join(', ')}
                  </small>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
