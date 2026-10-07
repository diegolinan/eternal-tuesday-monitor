/** Group a filtered view without changing the source ledger or its events. */
export function groupChanges(events, type = 'ALL') {
  const groups = new Map();
  for (const event of events) {
    if (type !== 'ALL' && event.type !== type) continue;
    const entries = groups.get(event.recorded_on) ?? [];
    entries.push(event);
    groups.set(event.recorded_on, entries);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, entries]) => ({ date, events: entries }));
}
