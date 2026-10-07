'use client';

import { useEffect, useSyncExternalStore } from 'react';

const viewEvent = 'etm:view-url';
function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback);
  window.addEventListener('hashchange', callback);
  window.addEventListener(viewEvent, callback);
  return () => {
    window.removeEventListener('popstate', callback);
    window.removeEventListener('hashchange', callback);
    window.removeEventListener(viewEvent, callback);
  };
}
const getSnapshot = () => window.location.search + window.location.hash;
const getServerSnapshot = () => null;

export function useViewUrl() {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  useEffect(() => {
    if (!snapshot?.includes('#')) return;
    let id: string;
    try {
      id = decodeURIComponent(snapshot.slice(snapshot.indexOf('#') + 1));
    } catch {
      return;
    }
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(id)
        ?.scrollIntoView({ block: 'start', behavior: 'instant' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [snapshot]);

  function update(
    values: Record<string, string | null>,
    mode: 'push' | 'replace' = 'push',
  ) {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === '') url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    // A new filter may hide the previous fragment target.
    url.hash = '';
    const href = url.pathname + url.search;
    if (
      href ===
      window.location.pathname + window.location.search + window.location.hash
    )
      return;
    window.history[mode === 'push' ? 'pushState' : 'replaceState'](
      window.history.state,
      '',
      href,
    );
    window.dispatchEvent(new Event(viewEvent));
  }
  return {
    search: snapshot?.split('#')[0] ?? '',
    ready: snapshot !== null,
    snapshot,
    update,
  };
}
