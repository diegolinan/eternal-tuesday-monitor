import signal from '@/public/data/daily-signal.json';

export function DailySignal() {
  return (
    <figure
      className="signal-ephemera daily-signal"
      aria-label={`Daily quote SHA-256, ${signal.edition} UTC`}
    >
      <span className="signal-packet-label">[ seq / Δ · sha-256 ]</span>
      <code className="daily-signal-hash">{signal.sha256}</code>
      <span className="signal-packet-end">{signal.edition} / UTC</span>
    </figure>
  );
}
