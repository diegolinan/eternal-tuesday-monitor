import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'The Eternal Tuesday Monitor',
  description: 'A dated, evidence-based monitor of observable temporal continuity behavior in current AI products.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
