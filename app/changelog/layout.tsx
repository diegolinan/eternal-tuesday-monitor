import type { Metadata } from 'next';
import { canonicalSiteUrl } from '@/lib/site-paths';

const url = new URL('changelog/', canonicalSiteUrl).href;

export const metadata: Metadata = {
  title: 'Evidence changes · The Eternal Tuesday Monitor',
  description:
    'Accepted changes to the Monitor evidence ledger, model identities and evaluation policy.',
  alternates: { canonical: url },
  openGraph: { title: 'Evidence changes · The Eternal Tuesday Monitor', url },
};

export default function ChangelogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
