export const TIME_ZONE = 'America/Argentina/Buenos_Aires';

export function localDateParts(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: TIME_ZONE,
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function localDateKey(value) {
  const { year, month, day } = localDateParts(value);
  return `${year}-${month}-${day}`;
}

export function scheduledWindowFor(value) {
  const { year, month, day } = localDateParts(value);
  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 43, 0, 0),
  );
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

export function eventLabel(event) {
  if (event === 'schedule') return 'SCHEDULED';
  if (event === 'workflow_dispatch') return 'MANUAL';
  return event.replaceAll('_', ' ').toUpperCase();
}
