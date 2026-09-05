import {
  AlarmClock,
  Archive,
  BadgeCheck,
  BookOpenText,
  CircleHelp,
  ClipboardClock,
  Clock3,
  FlaskConical,
  GitCompareArrows,
  MessageSquareText,
  Radar,
  RefreshCcw,
  TriangleAlert,
} from 'lucide-react';

const normalize = (value: string) => value.toUpperCase().replaceAll('_', ' ');

function StatusIcon({ value }: { value: string }) {
  const status = normalize(value);
  if (status.includes('TEMPORAL ANCHOR'))
    return <AlarmClock aria-hidden="true" />;
  if (status === 'ELAPSED') return <Clock3 aria-hidden="true" />;
  if (status === 'REVALIDATION') return <RefreshCcw aria-hidden="true" />;
  if (status.includes('STATE RECONCILIATION'))
    return <GitCompareArrows aria-hidden="true" />;
  if (status.includes('HISTORICAL VALIDITY'))
    return <Archive aria-hidden="true" />;
  if (status.includes('RETEST')) return <AlarmClock aria-hidden="true" />;
  if (status.includes('TEST REQUIRED'))
    return <ClipboardClock aria-hidden="true" />;
  if (status.includes('HISTORICAL')) return <Archive aria-hidden="true" />;
  if (status.includes('FAIL')) return <TriangleAlert aria-hidden="true" />;
  if (status.includes('NO PUBLIC') || status.includes('NO CURRENT'))
    return <Radar aria-hidden="true" />;
  if (status.includes('CONTROLLED')) return <FlaskConical aria-hidden="true" />;
  if (status.includes('REPORT') || status.includes('CONFIRMATION'))
    return <MessageSquareText aria-hidden="true" />;
  if (status.includes('DOCUMENT') || status.includes('PROVIDER'))
    return <BookOpenText aria-hidden="true" />;
  if (
    status.includes('VERIFIED') ||
    status.includes('TESTED') ||
    status.includes('SUFFICIENT') ||
    status.includes('REPRODUCED')
  )
    return <BadgeCheck aria-hidden="true" />;
  return <CircleHelp aria-hidden="true" />;
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
  return (
    <span
      className={`status-emblem status-emblem-${tone}${compact ? ' compact' : ''}`}
    >
      <StatusIcon value={label} />
      <span>{label}</span>
    </span>
  );
}
