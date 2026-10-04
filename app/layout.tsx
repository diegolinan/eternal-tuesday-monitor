import type { Metadata } from 'next';
import { canonicalSiteUrl, withBasePath } from '@/lib/site-paths';
import { PrivateAnalytics } from '@/components/private-analytics';
import monitorSnapshot from '@/public/data/monitor.json';
import './globals.css';
import './editorial.css';
import './jev-system.css';
import './typesafe-reference.css';

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
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
        <footer className="author-footer site-colophon">
          <div className="colophon-top">
            <div>
              <p className="colophon-name">THE ETERNAL TUESDAY MONITOR</p>
              <nav aria-label="Footer navigation">
                <a href={withBasePath('/')}>The Monitor →</a>
                <a href={withBasePath('/contributors/')}>The Clockkeepers →</a>
                <a href={withBasePath('/contribute/')}>Report a time leak →</a>
              </nav>
            </div>
            <dl className="colophon-dates">
              <div>
                <dt>Published</dt>
                <dd>
                  <time dateTime={monitorSnapshot.publishedOn}>
                    {monitorSnapshot.publishedOn}
                  </time>
                </dd>
              </div>
              <div>
                <dt>Evidence included through</dt>
                <dd>
                  <time dateTime={monitorSnapshot.dataCutoff}>
                    {monitorSnapshot.dataCutoff}
                  </time>
                </dd>
              </div>
            </dl>
          </div>
          <div className="colophon-author">
            <span>Behind Eternal Tuesday / Diego Liñan</span>
            <nav aria-label="Author and original article">
              <a
                href="https://www.linkedin.com/in/diegolinan"
                target="_blank"
                rel="noopener noreferrer"
              >
                LinkedIn ↗
              </a>
              <a
                href="https://www.linkedin.com/pulse/your-ai-lives-eternal-tuesday-diego-li%C3%B1an-av2xf/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Your AI Lives in an Eternal Tuesday · Original article ↗
              </a>
            </nav>
          </div>
        </footer>
        <PrivateAnalytics />
      </body>
    </html>
  );
}
