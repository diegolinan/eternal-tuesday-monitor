import { scheduledWindowAtOrBefore } from './automation-schedule.mjs';

function publicState(run) {
  if (run.status !== 'completed') return 'in_progress';
  return run.conclusion === 'success' ? 'complete' : 'needs_attention';
}

function publicCheck(run, routine = false) {
  if (!run) return null;
  const check = {
    startedAt: run.run_started_at ?? run.created_at,
    completedAt: run.status === 'completed' ? run.updated_at : null,
    state: publicState(run),
  };
  if (routine) {
    check.scheduledFor = scheduledWindowAtOrBefore(
      new Date(check.startedAt),
    ).toISOString();
  }
  return check;
}

export function compilePublicSystemStatus(runs, generatedAt = new Date()) {
  const sorted = [...runs].sort(
    (left, right) =>
      new Date(right.created_at).valueOf() -
      new Date(left.created_at).valueOf(),
  );
  const latest = sorted[0] ?? null;
  const lastRoutine = sorted.find((run) => run.event === 'schedule') ?? null;

  return {
    schemaVersion: '1.0.0',
    generatedAt: generatedAt.toISOString(),
    latestCheck: publicCheck(latest),
    lastRoutineCheck: publicCheck(lastRoutine, true),
  };
}
