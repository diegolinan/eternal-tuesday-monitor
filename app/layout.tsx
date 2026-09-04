import type { Metadata } from 'next';
import { canonicalSiteUrl } from '@/lib/site-paths';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(canonicalSiteUrl),
  title: 'The Eternal Tuesday Monitor',
  description:
    'A dated, evidence-based monitor of observable temporal continuity behavior in current AI products.',
  alternates: { canonical: canonicalSiteUrl },
  other: { 'release-date': '2026-09-07' },
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
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
