import type { Metadata } from 'next';
import { canonicalSiteUrl, withBasePath } from '@/lib/site-paths';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(canonicalSiteUrl),
  title: 'The Eternal Tuesday Monitor',
  description:
    'A dated, evidence-based monitor of observable temporal continuity behavior in current AI products.',
  alternates: { canonical: canonicalSiteUrl },
  icons: {
    icon: [
      { url: withBasePath('/favicon.svg'), type: 'image/svg+xml' },
      {
        url: withBasePath('/favicon-32.png'),
        type: 'image/png',
        sizes: '32x32',
      },
    ],
    shortcut: withBasePath('/favicon-32.png'),
  },
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
