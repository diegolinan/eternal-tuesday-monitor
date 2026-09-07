import type { Metadata } from 'next';
import { canonicalSiteUrl } from '@/lib/site-paths';

const url = new URL('contribute/', canonicalSiteUrl).href;

export const metadata: Metadata = {
  title: 'Report a time leak · The Eternal Tuesday Monitor',
  description:
    'Submit a public source or firsthand observation for human review.',
  alternates: { canonical: url },
  openGraph: { title: 'Report a time leak · The Eternal Tuesday Monitor', url },
};

export default function ContributeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
