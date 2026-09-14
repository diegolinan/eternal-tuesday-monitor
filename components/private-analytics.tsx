'use client';

import { Analytics } from '@vercel/analytics/next';

export function PrivateAnalytics() {
  if (process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS !== 'true') return null;
  return <Analytics />;
}
