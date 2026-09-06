'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  currentWindowState,
  elapsed,
  localTimeZone,
  nextScheduledWindow,
  relativeAge,
  remaining,
  scheduledWindowFor,
} from '@/lib/automation-schedule.mjs';
import { withBasePath } from '@/lib/site-paths';

type CheckState = 'complete' | 'in_progress' | 'needs_attention';
type WindowState =
  | CheckState
  | 'on_deck'
  | 'starting_window'
  | 'awaiting_start'
  | 'status_unavailable'
  | 'reading';

type PublicCheck = {
  startedAt: string;
  completedAt: string | null;
  state: CheckState;
};

type RoutineCheck = PublicCheck & {
  scheduledFor: string;
};

type PublicSystemStatus = {
  schemaVersion: '1.0.0';
  generatedAt: string;
  latestCheck: PublicCheck | null;
  lastRoutineCheck: RoutineCheck | null;
};

const STATUS_URL = withBasePath('/data/system-status.json');

const labels: Record<WindowState, string> = {
  complete: 'COMPLETE',
  in_progress: 'IN PROGRESS',
  needs_attention: 'NEEDS ATTENTION',
  on_deck: 'ON DECK',
  starting_window: 'STARTING WINDOW',
  awaiting_start: 'AWAITING START',
  status_unavailable: 'STATUS UNAVAILABLE',
  reading: 'READING',
};

function displayDate(value: string | Date | null) {
  if (!value) return 'NOT ESTABLISHED';
  const date = value instanceof Date ? value : new Date(value);
  return date
    .toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    .toUpperCase();
}

function StatusStamp({ state }: { state: WindowState }) {
  return (
    <span className={`automation-stamp automation-stamp--${state}`}>
      <span>{labels[state]}</span>
    </span>
  );
}

export function AutomationStatus() {
  const [status, setStatus] = useState<PublicSystemStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [feedError, setFeedError] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const initialClock = window.setTimeout(() => setNow(new Date()), 0);
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    const read = () =>
      fetch(`${STATUS_URL}?t=${Date.now()}`, { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) throw new Error('System status unavailable');
          return response.json() as Promise<PublicSystemStatus>;
        })
        .then((payload) => {
          setStatus(payload);
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

  const currentWindow = useMemo(
    () => (now ? scheduledWindowFor(now) : null),
    [now],
  );
  const nextWindow = useMemo(
    () => (now ? nextScheduledWindow(now) : null),
    [now],
  );
  const timeZone = useMemo(() => (now ? localTimeZone(now) : null), [now]);
  const currentState: WindowState =
    !loaded || !now || !currentWindow
      ? 'reading'
      : feedError && !status
        ? 'status_unavailable'
        : currentWindowState({
            now,
            lastRoutineCheck: status?.lastRoutineCheck ?? null,
          });
  const latestState: WindowState = !loaded
    ? 'reading'
    : (status?.latestCheck?.state ?? 'status_unavailable');

  return (
    <section
      className="automation-status"
      id="automation"
      aria-labelledby="automation-title"
    >
      <div className="automation-status-copy">
        <p className="section-code">MONITOR STATUS · PUBLIC DATA</p>
        <h2 id="automation-title">Official-source watch</h2>
        <p>
          Discovery checks official model sources. It never runs the five
          behavioral probes and never creates a PASS or FAIL.
        </p>
        <p className="automation-time-zone" title={timeZone?.identifier}>
          ALL TIMES SHOWN IN YOUR LOCAL TIME
          {timeZone && <small>{timeZone.label}</small>}
        </p>
      </div>

      <div className="automation-status-board">
        <dl className="automation-timeline">
          <div>
            <dt>Latest check</dt>
            <dd>
              {!loaded
                ? 'READING…'
                : feedError && !status
                  ? 'NOT AVAILABLE'
                  : displayDate(status?.latestCheck?.startedAt ?? null)}
              <StatusStamp state={latestState} />
            </dd>
          </div>

          <div>
            <dt>Current check</dt>
            <dd aria-live="polite">
              {currentWindow ? displayDate(currentWindow) : 'CALCULATING…'}
              <StatusStamp state={currentState} />
              {now && currentWindow && currentState === 'on_deck' && (
                <small>READY · WINDOW OPENS SOON</small>
              )}
              {now && currentWindow && currentState === 'starting_window' && (
                <small>WINDOW OPEN · TIMING MAY VARY</small>
              )}
              {now && currentWindow && currentState === 'awaiting_start' && (
                <small>
                  WINDOW OPEN · {elapsed(currentWindow, now)} SINCE SCHEDULED
                </small>
              )}
            </dd>
          </div>

          <div>
            <dt>Next check</dt>
            <dd>
              {nextWindow ? displayDate(nextWindow) : 'CALCULATING…'}
              <StatusStamp state="on_deck" />
              {nextWindow && now && (
                <small className="automation-countdown" aria-hidden="true">
                  IN {remaining(nextWindow, now)}
                </small>
              )}
              {nextWindow && now && (
                <span className="sr-only">
                  Next check in approximately{' '}
                  {Math.max(
                    1,
                    Math.ceil((nextWindow.valueOf() - now.valueOf()) / 60_000),
                  )}{' '}
                  minutes.
                </span>
              )}
            </dd>
          </div>
        </dl>

        <p className="automation-freshness">
          {status && now
            ? `STATUS UPDATED ${relativeAge(new Date(status.generatedAt), now)}`
            : loaded
              ? 'STATUS TEMPORARILY UNAVAILABLE'
              : 'READING STATUS…'}
        </p>
      </div>
    </section>
  );
}
