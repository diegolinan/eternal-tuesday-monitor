import type { Metadata } from 'next';
import { canonicalSiteUrl } from '@/lib/site-paths';

const url = new URL('models/', canonicalSiteUrl).href;

export const metadata: Metadata = {
  title: 'Model register · The Eternal Tuesday Monitor',
  description:
    'Exact model identities tracked separately from behavioral evidence and test readiness.',
  alternates: { canonical: url },
  openGraph: { title: 'Model register · The Eternal Tuesday Monitor', url },
};

export default function ModelsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
