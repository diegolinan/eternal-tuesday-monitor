export const SCHEDULE = Object.freeze({
  hourUtc: 12,
  minuteUtc: 43,
  graceMinutes: 15,
});

export function scheduledWindowFor(value) {
  const window = new Date(value);
  window.setUTCHours(SCHEDULE.hourUtc, SCHEDULE.minuteUtc, 0, 0);
  return window;
}

export function scheduledWindowAtOrBefore(value) {
  const window = scheduledWindowFor(value);
  if (window <= value) return window;
  window.setUTCDate(window.getUTCDate() - 1);
  return window;
}

export function nextScheduledWindow(now) {
  const today = scheduledWindowFor(now);
  if (today > now) return today;
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow;
}

export function remaining(target, now) {
  const seconds = Math.max(
    0,
    Math.floor((target.valueOf() - now.valueOf()) / 1000),
  );
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${hours}H ${String(minutes).padStart(2, '0')}M ${String(rest).padStart(2, '0')}S`;
}

export function elapsed(target, now) {
  return remaining(now, target);
}

export function scheduleKey(value) {
  return value.toISOString().slice(0, 10);
}

export function currentWindowState({ now, lastRoutineCheck }) {
  const window = scheduledWindowFor(now);
  const matchingCheck =
    lastRoutineCheck &&
    scheduleKey(new Date(lastRoutineCheck.scheduledFor)) === scheduleKey(window)
      ? lastRoutineCheck
      : null;

  if (matchingCheck) return matchingCheck.state;
  if (now < window) return 'on_deck';
  if (now.valueOf() - window.valueOf() <= SCHEDULE.graceMinutes * 60_000)
    return 'starting_window';
  return 'awaiting_start';
}

export function localTimeZone(value = new Date()) {
  const identifier =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'LOCAL TIME';
  const city = identifier.split('/').at(-1)?.replaceAll('_', ' ') ?? identifier;
  const offset =
    new Intl.DateTimeFormat('en', { timeZoneName: 'shortOffset' })
      .formatToParts(value)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'LOCAL';
  return {
    identifier,
    label: `${city.toUpperCase()} · ${offset.toUpperCase()}`,
  };
}

export function relativeAge(value, now) {
  const seconds = Math.max(
    0,
    Math.floor((now.valueOf() - value.valueOf()) / 1000),
  );
  if (seconds < 60) return 'JUST NOW';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}M AGO`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}H AGO`;
  return `${Math.floor(hours / 24)}D AGO`;
}
