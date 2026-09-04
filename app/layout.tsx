import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { canonicalSiteUrl, withBasePath } from '@/lib/site-paths';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(canonicalSiteUrl),
  title: 'The Eternal Tuesday Monitor',
  description:
    'A dated, evidence-based monitor of observable temporal continuity behavior in current AI products.',
  alternates: { canonical: canonicalSiteUrl },
  openGraph: {
    type: 'website',
    url: canonicalSiteUrl,
    siteName: 'The Eternal Tuesday Monitor',
    title: 'The Eternal Tuesday Monitor',
    description:
      'A dated, evidence-based monitor of observable temporal continuity behavior in current AI products.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const bodyStyle = {
    '--page-texture': `url("${withBasePath('/assets/diagnostic-panel.png')}")`,
  } as CSSProperties;

  return (
    <html lang="en">
      <body style={bodyStyle}>{children}</body>
    </html>
  );
}
