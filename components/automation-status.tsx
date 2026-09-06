'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  elapsed,
  eventLabel,
  localDateKey,
  nextScheduledWindow,
  remaining,
  scheduledWindowFor,
  TIME_ZONE,
} from '@/lib/automation-schedule.mjs';

type WorkflowRun = {
  id: number;
  status: string;
  conclusion: string | null;
  event: string;
  created_at: string;
  updated_at: string;
  html_url: string;
};

const API =
  'https://api.github.com/repos/diegolinan/eternal-tuesday-monitor/actions/workflows/discover-models.yml/runs?per_page=50';

function displayDate(value: string | Date | null) {
  if (!value) return 'NOT ESTABLISHED';
  const date = value instanceof Date ? value : new Date(value);
  return date
    .toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: TIME_ZONE,
    })
    .toUpperCase();
}

function runState(run: WorkflowRun) {
  return `${run.status.toUpperCase()} · ${(run.conclusion ?? 'PENDING').toUpperCase()}`;
}

export function AutomationStatus() {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [feedError, setFeedError] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const initialClock = window.setTimeout(() => setNow(new Date()), 0);
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    const read = () =>
      fetch(API, { headers: { Accept: 'application/vnd.github+json' } })
        .then((response) => {
          if (!response.ok)
            throw new Error('GitHub workflow status unavailable');
          return response.json() as Promise<{ workflow_runs?: WorkflowRun[] }>;
        })
        .then((payload) => {
          setRuns(payload.workflow_runs ?? []);
          setFeedError(false);
        })
        .catch(() => setFeedError(true))
        .finally(() => setLoaded(true));
    void read();
    const refresh = window.setInterval(() => void read(), 300_000);
    return () => {
      window.clearTimeout(initialClock);
      window.clearInterval(clock);
      window.clearInterval(refresh);
    };
  }, []);

  const latest = runs[0] ?? null;
  const scheduledRuns = runs.filter((run) => run.event === 'schedule');
  const lastScheduled = scheduledRuns[0] ?? null;
  const todayWindow = useMemo(
    () => (now ? scheduledWindowFor(now) : null),
    [now],
  );
  const nextWindow = useMemo(
    () => (now ? nextScheduledWindow(now) : null),
    [now],
  );
  const todayScheduled =
    now && !feedError
      ? (scheduledRuns.find(
          (run) => localDateKey(new Date(run.created_at)) === localDateKey(now),
        ) ?? null)
      : null;
  const isDelayed = Boolean(
    now && todayWindow && now > todayWindow && !todayScheduled && !feedError,
  );

  return (
    <section
      className="automation-status"
      id="automation"
      aria-labelledby="automation-title"
    >
      <div>
        <p className="section-code">AUTOMATION STATUS · PUBLIC GITHUB DATA</p>
        <h2 id="automation-title">Official-source watch</h2>
        <p>
          Discovery checks official model sources. It never runs the five
          behavioral probes and never creates a PASS or FAIL.
        </p>
      </div>
      <dl>
        <div>
          <dt>Last attempt</dt>
          <dd>
            {!loaded
              ? 'READING…'
              : feedError
                ? 'FEED UNAVAILABLE'
                : displayDate(latest?.created_at ?? null)}
            {latest && !feedError && (
              <small>
                {eventLabel(latest.event)} · {runState(latest)}
              </small>
            )}
          </dd>
        </div>
        <div>
          <dt>Last scheduled run</dt>
          <dd>
            {!loaded
              ? 'READING…'
              : feedError
                ? 'FEED UNAVAILABLE'
                : displayDate(lastScheduled?.created_at ?? null)}
            {lastScheduled && !feedError && (
              <small>{runState(lastScheduled)}</small>
            )}
          </dd>
        </div>
        <div>
          <dt>Today&apos;s scheduled run</dt>
          <dd aria-live="polite">
            {!loaded || !now || !todayWindow
              ? 'CALCULATING…'
              : feedError
                ? 'FEED UNAVAILABLE'
                : todayScheduled
                  ? displayDate(todayScheduled.created_at)
                  : now < todayWindow
                    ? 'NOT DUE YET'
                    : 'WAITING FOR GITHUB'}
            {now && todayWindow && !feedError && (
              <small>
                {todayScheduled
                  ? runState(todayScheduled)
                  : now < todayWindow
                    ? `WINDOW ${displayDate(todayWindow)} · IN ${remaining(todayWindow, now)}`
                    : `WINDOW ${displayDate(todayWindow)} · ${elapsed(todayWindow, now)} DELAYED`}
              </small>
            )}
          </dd>
        </div>
        <div>
          <dt>Next scheduled window</dt>
          <dd>
            {nextWindow ? displayDate(nextWindow) : 'CALCULATING…'}
            {nextWindow && <small>NOMINAL · GITHUB MAY DELAY</small>}
          </dd>
        </div>
      </dl>
      {feedError && loaded && (
        <p className="automation-warning">
          GitHub&apos;s public workflow feed is unavailable. Schedule status
          cannot be confirmed right now.
        </p>
      )}
      {isDelayed && (
        <p className="automation-warning">
          Today&apos;s scheduled run has not appeared in GitHub yet. Scheduled
          jobs can be delayed or dropped; this panel will update automatically
          if the run arrives.
        </p>
      )}
    </section>
  );
}
