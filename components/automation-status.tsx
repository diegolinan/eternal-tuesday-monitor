'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';

type WorkflowRun = {
  id: number;
  status: string;
  conclusion: string | null;
  event: string;
  created_at: string;
  updated_at: string;
  html_url: string;
};

const API = 'https://api.github.com/repos/diegolinan/eternal-tuesday-monitor/actions/workflows/discover-models.yml/runs?per_page=20';
const WORKFLOW = 'https://github.com/diegolinan/eternal-tuesday-monitor/actions/workflows/discover-models.yml';
const EVALUATE = 'https://github.com/diegolinan/eternal-tuesday-monitor/actions/workflows/evaluate-model.yml';

function nextScheduled(now: Date) {
  const next = new Date(now);
  next.setUTCHours(12, 43, 0, 0); // 09:43 America/Argentina/Buenos_Aires
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function displayDate(value: string | Date | null) {
  if (!value) return 'NOT ESTABLISHED';
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).toUpperCase();
}

function remaining(target: Date, now: Date) {
  const seconds = Math.max(0, Math.floor((target.valueOf() - now.valueOf()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${hours}H ${String(minutes).padStart(2, '0')}M ${String(rest).padStart(2, '0')}S`;
}

export function AutomationStatus() {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    const read = () => fetch(API, { headers: { Accept: 'application/vnd.github+json' } })
      .then((response) => {
        if (!response.ok) throw new Error('GitHub workflow status unavailable');
        return response.json();
      })
      .then((payload) => setRuns(payload.workflow_runs ?? []))
      .finally(() => setLoaded(true));
    read().catch(() => undefined);
    const refresh = window.setInterval(() => read().catch(() => undefined), 300_000);
    return () => { window.clearInterval(clock); window.clearInterval(refresh); };
  }, []);

  const latest = runs[0] ?? null;
  const success = runs.find((run) => run.conclusion === 'success') ?? null;
  const next = useMemo(() => nextScheduled(now), [now]);
  const stale = latest ? now.valueOf() - new Date(latest.created_at).valueOf() > 36 * 3600 * 1000 : false;

  return (
    <section className="automation-status" id="automation" aria-labelledby="automation-title">
      <div>
        <p className="section-code">AUTOMATION STATUS · PUBLIC GITHUB DATA</p>
        <h2 id="automation-title">Official-source watch</h2>
        <p>Discovery checks official model sources. It never runs the five behavioral probes and never creates a PASS or FAIL.</p>
      </div>
      <dl>
        <div><dt>Last attempt</dt><dd>{loaded ? displayDate(latest?.created_at ?? null) : 'READING…'}{latest && <small>{latest.status.toUpperCase()} · {(latest.conclusion ?? 'PENDING').toUpperCase()}</small>}</dd></div>
        <div><dt>Last success</dt><dd>{loaded ? displayDate(success?.updated_at ?? null) : 'READING…'}</dd></div>
        <div><dt>Next scheduled attempt</dt><dd>{displayDate(next)}<small>ESTIMATED · IN {remaining(next, now)}</small></dd></div>
      </dl>
      {stale && <p className="automation-warning">No discovery attempt is visible in the last 36 hours. GitHub schedules may be delayed; inspect the workflow.</p>}
      <div className="automation-links">
        <a href={latest?.html_url ?? WORKFLOW} target="_blank" rel="noreferrer">Inspect discovery runs <ExternalLink aria-hidden="true" /></a>
        <a href={EVALUATE} target="_blank" rel="noreferrer">Run five probes manually <ExternalLink aria-hidden="true" /></a>
      </div>
    </section>
  );
}
