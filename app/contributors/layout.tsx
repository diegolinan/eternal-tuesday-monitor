import type { Metadata } from 'next';
import { canonicalSiteUrl } from '@/lib/site-paths';

const url = new URL('contributors/', canonicalSiteUrl).href;

export const metadata: Metadata = {
  title: 'The Clockkeepers · The Eternal Tuesday Monitor',
  description:
    'The people and bounded automated systems that contribute to the Monitor.',
  alternates: { canonical: url },
  openGraph: { url, title: 'The Clockkeepers' },
};

export default function ContributorsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
