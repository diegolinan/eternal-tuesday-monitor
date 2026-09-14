import { withBasePath } from '@/lib/site-paths';
import contributorsSnapshot from '@/public/data/contributors.json';

export const dynamic = 'force-static';

type Contributor = {
  id: string;
  kind: 'PERSON' | 'AUTOMATED_SYSTEM';
  display_name: string;
  role_summary: string;
  description: string;
  started_on: string;
};

type Contribution = {
  id: string;
  occurred_on: string;
  contributor_id: string;
  role: string;
  summary: string;
};

const roleLabel = (role: string) => role.replaceAll('_', ' ');

function ContributorCard({
  contributor,
  contributions,
}: {
  contributor: Contributor;
  contributions: Contribution[];
}) {
  return (
    <article className="clockkeeper-card" id={contributor.id}>
      <header>
        <span>
          {contributor.kind === 'PERSON' ? 'PERSON' : 'BOUNDED SYSTEM'}
        </span>
        <b>SINCE {contributor.started_on}</b>
      </header>
      <div>
        <h3>{contributor.display_name}</h3>
        <p className="clockkeeper-role">{contributor.role_summary}</p>
        <p>{contributor.description}</p>
        {contributions.length > 0 ? (
          <details>
            <summary>
              {contributions.length} versioned contribution
              {contributions.length === 1 ? '' : 's'}
            </summary>
            <ol>
              {contributions.map((item) => (
                <li key={item.id}>
                  <time dateTime={item.occurred_on}>{item.occurred_on}</time>
                  <strong>{roleLabel(item.role)}</strong>
                  <span>{item.summary}</span>
                </li>
              ))}
            </ol>
          </details>
        ) : (
          <p className="clockkeeper-empty">
            Role registered; no public artifact attribution has been established
            yet.
          </p>
        )}
      </div>
    </article>
  );
}

export default function ContributorsPage() {
  const data = contributorsSnapshot as {
    people: Contributor[];
    automatedSystems: Contributor[];
    contributions: Contribution[];
  };
  const forContributor = (id: string) =>
    data.contributions.filter((item) => item.contributor_id === id);

  return (
    <main className="contributors-page" id="main-content">
      <header className="masthead">
        <a className="series-mark" href={withBasePath('/')}>
          The Eternal Tuesday Monitor
        </a>
        <nav aria-label="Clockkeepers navigation">
          <a href={withBasePath('/')}>Findings</a>
          <a href={withBasePath('/changelog/')}>Changes</a>
          <a href={withBasePath('/contribute/')}>Contribute</a>
        </nav>
      </header>

      <section className="clockkeepers-hero">
        <p className="eyebrow">PUBLIC ATTRIBUTION LEDGER · NO LEADERBOARD</p>
        <h1>The Clockkeepers</h1>
        <p>
          The Monitor separates human judgment from automated work. A name here
          identifies a bounded contribution; it does not transfer authorship,
          evidentiary authority, or responsibility across the whole project.
        </p>
      </section>

      <section className="clockkeeper-section" aria-labelledby="people-title">
        <div className="section-heading">
          <div>
            <p className="section-code">HUMAN DESK</p>
            <h2 id="people-title">People</h2>
          </div>
          <p>
            Public names appear only with consent. A submitted lead never makes
            a person public automatically.
          </p>
        </div>
        <div className="clockkeeper-grid people-grid">
          {data.people.map((item) => (
            <ContributorCard
              key={item.id}
              contributor={item}
              contributions={forContributor(item.id)}
            />
          ))}
        </div>
      </section>

      <section
        className="clockkeeper-section clockkeeper-machines"
        aria-labelledby="systems-title"
      >
        <div className="section-heading section-heading-light">
          <div>
            <p className="section-code">MACHINE ROOM</p>
            <h2 id="systems-title">Automated systems</h2>
          </div>
          <p>
            These systems detect, search, recalculate or execute. None of them
            can independently accept evidence or declare a behavioral verdict.
          </p>
        </div>
        <div className="clockkeeper-grid">
          {data.automatedSystems.map((item) => (
            <ContributorCard
              key={item.id}
              contributor={item}
              contributions={forContributor(item.id)}
            />
          ))}
        </div>
      </section>

      <aside className="clockkeeper-privacy">
        <strong>PRIVATE TRAFFIC MEASUREMENT</strong>
        <p>
          Anonymous aggregate visits help maintain the site. There is no public
          counter, visitor profile, advertising tracker, or form-field
          analytics.
        </p>
      </aside>

      <footer>
        <span>THE CLOCKKEEPERS</span>
        <a href={withBasePath('/contribute/')}>REPORT A TIME LEAK</a>
        <a href={withBasePath('/')}>RETURN TO THE MONITOR</a>
      </footer>
    </main>
  );
}
