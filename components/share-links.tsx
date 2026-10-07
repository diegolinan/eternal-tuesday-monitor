'use client';

import { useState } from 'react';
import { Copy, Link2 } from 'lucide-react';

export function Permalink({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="section-permalink"
      href={href}
      aria-label={`Link to ${label}`}
      title={`Link to ${label}`}
    >
      <Link2 aria-hidden="true" />
    </a>
  );
}

export function CopyViewLink({ disabled = false }: { disabled?: boolean }) {
  const [message, setMessage] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMessage('Link copied');
    } catch {
      setMessage('Copy the address from your browser to share this view.');
    }
  }
  return (
    <div className="share-view">
      <button type="button" disabled={disabled} onClick={copy}>
        <Copy aria-hidden="true" />
        Copy view link
      </button>
      <output aria-live="polite">{message}</output>
    </div>
  );
}
