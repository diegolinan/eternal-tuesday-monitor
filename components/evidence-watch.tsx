'use client';

import { useEffect, useState } from 'react';
import { withBasePath } from '@/lib/site-paths';

type EvidenceWatchData = {
  lastSearchAt: string | null;
  latestReviewAt?: string | null;
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
      | 'PARTIAL'
      | 'NOT_CONFIGURED'
      | 'UNAVAILABLE'
      | 'SKIPPED';
    searchedAt: string | null;
    resultsReviewed: number;
    candidatesFound: number;
    note: string;
  }>;
  candidateCounts: {
    latestSearchLeads?: number;
    total?: number;
    pending: number;
    reviewed?: number;
    reproductionRequired?: number;
    supportingSourcesAccepted?: number;
    needsMoreInformation?: number;
    closedWithoutPromotion?: number;
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
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(new Date(value))
    : 'No completed search yet';

export function EvidenceWatch() {
  const [data, setData] = useState<EvidenceWatchData | null>(null);
  const totalCandidates =
    data?.candidateCounts.total ?? data?.candidateCounts.pending ?? 0;
  const reviewedCandidates = data?.candidateCounts.reviewed ?? 0;
  const reproductionRequired = data?.candidateCounts.reproductionRequired ?? 0;
  const supportingSourcesAccepted =
    data?.candidateCounts.supportingSourcesAccepted ?? 0;
  const needsMoreInformation = data?.candidateCounts.needsMoreInformation ?? 0;
  const closedWithoutPromotion =
    data?.candidateCounts.closedWithoutPromotion ?? 0;
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
                {channel.resultsReviewed} results examined automatically ·{' '}
                {channel.candidatesFound} potential leads
              </small>
              <p>
                {channel.name === 'GENERAL_WEB' &&
                channel.state === 'NOT_CONFIGURED'
                  ? 'Broad-web search is outside the current public search scope.'
                  : channel.note}
              </p>
            </article>
          ))}
        </div>
        {totalCandidates > 0 && (
          <div className="evidence-candidate-strip">
            <p className="evidence-candidate-context">
              Active lead ledger · the latest search added{' '}
              {data?.candidateCounts.latestSearchLeads ?? 0} new lead
              {(data?.candidateCounts.latestSearchLeads ?? 0) === 1 ? '' : 's'}.
            </p>
            <div>
              <strong>
                {data?.candidateCounts.pending ?? 0} POTENTIAL LEAD
                {(data?.candidateCounts.pending ?? 0) === 1 ? '' : 'S'} AWAITING
                HUMAN REVIEW
              </strong>
              {(data?.candidateCounts.pending ?? 0) > 0 ? (
                <p>
                  Unreviewed titles are withheld while their source, scope and
                  claim are checked.
                </p>
              ) : (
                <p>No governed lead is waiting for its first review.</p>
              )}
            </div>
            {reviewedCandidates > 0 && (
              <div>
                <strong>
                  {reviewedCandidates} LEAD
                  {reviewedCandidates === 1 ? '' : 'S'} REVIEWED
                </strong>
                <ul className="evidence-review-summary">
                  {reproductionRequired > 0 && (
                    <li>
                      {reproductionRequired} require controlled behavioral
                      reproduction
                    </li>
                  )}
                  {supportingSourcesAccepted > 0 && (
                    <li>
                      {supportingSourcesAccepted} accepted as supporting sources
                    </li>
                  )}
                  {needsMoreInformation > 0 && (
                    <li>{needsMoreInformation} need more information</li>
                  )}
                  {closedWithoutPromotion > 0 && (
                    <li>{closedWithoutPromotion} closed without promotion</li>
                  )}
                </ul>
                {data?.latestReviewAt && (
                  <time>
                    Latest review completed {moment(data.latestReviewAt)}
                  </time>
                )}
              </div>
            )}
            <small>
              Review classifies a lead. It does not create an observation, PASS
              or FAIL.
            </small>
          </div>
        )}
      </div>
    </section>
  );
}
