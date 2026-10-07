'use client';

import { useEffect, useState } from 'react';

// Typeset ornaments, never dates, evidence identifiers, or operational telemetry.
const fragments = [
  'U2FtZSB0aHJlYWQuIERpZmZlcmVudCBub3cu',
  'VGhlIHdvcmxkIGRpZG50IHdhaXQuL2NvbnRleHQ=',
  'c2VxdWVuY2UvL3N0YXRlLi4ucmVmZXJlbmNl',
  'Y29udGludWl0eS8vdGltZS4uLm5vdy9ub3c=',
];
export function SignalEphemera({
  variant = 'packet',
}: {
  variant?: 'packet' | 'rail';
}) {
  // Stable server/first-client render; only characters change after hydration.
  const [edition, setEdition] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setEdition(
        crypto.getRandomValues(new Uint32Array(1))[0] % fragments.length,
      );
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const fragment = fragments[edition];
  if (variant === 'rail') {
    return (
      <span className="signal-rail" aria-hidden="true">
        {fragment} / · / {fragment.slice(4)} — //
      </span>
    );
  }
  return (
    <div className="signal-ephemera" aria-hidden="true" data-edition={edition}>
      <span className="signal-packet-label">[ seq / Δ ]</span>
      {Array.from({ length: 7 }, (_, row) => {
        const line = fragment.repeat(2).slice(row * 3, row * 3 + 28);
        return (
          <span className="signal-packet-row" key={row}>
            {line.slice(0, 10)}
            <i>{row === edition + 1 ? ' ·· ' : line.slice(10, 14)}</i>
            {line.slice(14)}
          </span>
        );
      })}
      <span className="signal-packet-end">────────── / ──</span>
    </div>
  );
}
