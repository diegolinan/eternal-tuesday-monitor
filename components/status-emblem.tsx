const normalize = (value: string) => value.toUpperCase().replaceAll('_', ' ');

function labelFamily(label: string) {
  if (label.includes('FAIL') || label.includes('ATTENTION')) return 'tag';
  if (
    label.includes('RETEST') ||
    label.includes('REVIEW') ||
    label.includes('TEST REQUIRED') ||
    label.includes('NO TEST') ||
    label.includes('NO ACCEPTED')
  )
    return 'burst';
  return 'ticket';
}

export function StatusEmblem({
  value,
  compact = false,
}: {
  value: string;
  compact?: boolean;
}) {
  const label = normalize(value);
  const tone = label.toLowerCase().replaceAll(' ', '-').replaceAll('/', '-');
  const family = labelFamily(label);
  return (
    <span
      className={`status-emblem status-emblem-${tone} status-emblem--${family}${compact ? ' compact' : ''}`}
    >
      <span className="status-emblem-copy">{label}</span>
    </span>
  );
}
