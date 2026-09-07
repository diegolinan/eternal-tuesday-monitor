'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  currentWindowState,
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
  const todayWindowIsOpen = ['starting_window', 'awaiting_start'].includes(
    currentState,
  );
  const nextPlannedWindow = todayWindowIsOpen ? currentWindow : nextWindow;
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
        <p className="section-code">OFFICIAL-SOURCE SCAN · PUBLIC STATUS</p>
        <h2 id="automation-title">Daily catalog watch</h2>
        <p>
          This daily scan reads approved provider pages to detect model-listing
          changes. It does not contact a model, run a behavioral probe, or
          create a PASS or FAIL.
        </p>
        <p className="automation-time-zone" title={timeZone?.identifier}>
          ALL TIMES SHOWN IN YOUR LOCAL TIME
          {timeZone && <small>{timeZone.label}</small>}
        </p>
      </div>

      <div className="automation-status-board">
        <dl className="automation-timeline automation-timeline--compact">
          <div>
            <dt>Latest reported source scan</dt>
            <dd>
              {!loaded
                ? 'READING…'
                : feedError && !status
                  ? 'NOT AVAILABLE'
                  : displayDate(status?.latestCheck?.startedAt ?? null)}
              <StatusStamp state={latestState} />
              {status?.latestCheck?.completedAt && (
                <small>
                  COMPLETED {displayDate(status.latestCheck.completedAt)}
                </small>
              )}
            </dd>
          </div>

          <div>
            <dt>
              {todayWindowIsOpen
                ? "Today's planned source scan"
                : 'Next planned source scan'}
            </dt>
            <dd>
              {nextPlannedWindow
                ? displayDate(nextPlannedWindow)
                : 'CALCULATING…'}
              <StatusStamp
                state={todayWindowIsOpen ? currentState : 'on_deck'}
              />
              {nextPlannedWindow && now && nextPlannedWindow > now && (
                <small className="automation-countdown" aria-hidden="true">
                  IN {remaining(nextPlannedWindow, now)}
                </small>
              )}
              {nextPlannedWindow && now && nextPlannedWindow <= now && (
                <small className="automation-countdown">START WINDOW OPEN</small>
              )}
              {nextPlannedWindow && now && nextPlannedWindow > now && (
                <span className="sr-only">
                  Next source scan in approximately{' '}
                  {Math.max(
                    1,
                    Math.ceil(
                      (nextPlannedWindow.valueOf() - now.valueOf()) / 60_000,
                    ),
                  )}{' '}
                  minutes.
                </span>
              )}
            </dd>
          </div>
        </dl>

        {['in_progress', 'needs_attention'].includes(currentState) && (
          <p className={`automation-incident automation-incident--${currentState}`}>
            <StatusStamp state={currentState} />
            {currentState === 'in_progress'
              ? 'A source scan is currently in progress.'
              : 'The latest routine source scan needs attention.'}
          </p>
        )}

        <p className="automation-freshness">
          {status && now
            ? `STATUS BOARD REFRESHED ${relativeAge(new Date(status.generatedAt), now)}`
            : loaded
              ? 'STATUS TEMPORARILY UNAVAILABLE'
              : 'READING STATUS…'}
        </p>
      </div>
    </section>
  );
}
