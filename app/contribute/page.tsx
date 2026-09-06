'use client';

import Script from 'next/script';
import { SyntheticEvent, useEffect, useRef, useState } from 'react';
import { withBasePath } from '@/lib/site-paths';

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: Record<string, unknown>,
      ) => string;
      reset: (id?: string) => void;
    };
  }
}

const endpoint = process.env.NEXT_PUBLIC_CONTRIBUTION_ENDPOINT ?? '';
const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

export default function ContributePage() {
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const [token, setToken] = useState('');
  const [scriptReady, setScriptReady] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );
  const enabled = Boolean(endpoint && siteKey);

  useEffect(() => {
    if (
      !scriptReady ||
      !siteKey ||
      !widget.current ||
      !window.turnstile ||
      widgetId.current
    )
      return;
    widgetId.current = window.turnstile.render(widget.current, {
      sitekey: siteKey,
      callback: (value: string) => setToken(value),
      'expired-callback': () => setToken(''),
      theme: 'light',
    });
  }, [scriptReady]);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (!enabled || !token) return;
    setState('sending');
    const form = new FormData(event.currentTarget);
    const payload: Record<string, string | boolean> = Object.fromEntries(
      [...form.entries()].map(([key, value]) => [
        key,
        typeof value === 'string' ? value : value.name,
      ]),
    );
    payload.attributionConsent = form.get('attributionConsent') === 'on';
    payload.turnstileToken = token;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Submission rejected');
      event.currentTarget.reset();
      window.turnstile?.reset(widgetId.current);
      setToken('');
      setState('sent');
    } catch {
      setState('error');
    }
  }

  return (
    <main className="contribute-page">
      {enabled && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setScriptReady(true)}
        />
      )}
      <header className="masthead">
        <a className="series-mark" href={withBasePath('/')}>
          The Eternal Tuesday Monitor
        </a>
        <nav aria-label="Contribution navigation">
          <a href={withBasePath('/')}>Back to the Monitor</a>
        </nav>
      </header>
      <section className="contribute-hero">
        <div className="roadside-sign" aria-hidden="true">
          <span>HELP KEEP</span>
          <strong>THE CLOCK</strong>
          <b>HONEST</b>
        </div>
        <div>
          <p className="section-code">COMMUNITY SERVICE DESK · FORM ETM-5</p>
          <h1>Report a time leak</h1>
          <p>
            Found a credible source—or saw a product handle time, stale facts,
            changed state, or historical truth in a revealing way? Send us the
            lead.
          </p>
        </div>
      </section>
      <section className="contribute-layout">
        <form className="contribution-form" onSubmit={submit}>
          <div className="form-intro">
            <strong>A lead is not a verdict.</strong>
            <p>
              Every submission enters a review queue. It cannot directly change
              the Monitor or create a PASS or FAIL.
            </p>
          </div>
          <label>
            What are you sending?
            <select name="submissionType" required defaultValue="FOUND_SOURCE">
              <option value="FOUND_SOURCE">A public source I found</option>
              <option value="FIRSTHAND_OBSERVATION">
                A firsthand observation
              </option>
            </select>
          </label>
          <div className="form-pair">
            <label>
              Vendor
              <input
                name="vendor"
                required
                maxLength={80}
                placeholder="Anthropic, OpenAI, Google…"
              />
            </label>
            <label>
              Exact model, if known
              <input
                name="model"
                required
                maxLength={120}
                placeholder="Claude Haiku 4.5 or unknown"
              />
            </label>
          </div>
          <label>
            Product and surface
            <input
              name="productSurface"
              required
              maxLength={160}
              placeholder="Claude Code / resumed terminal session"
            />
          </label>
          <label>
            Which Monitor question?
            <select name="probeId" required defaultValue="UNSURE">
              <option value="UNSURE">I am not sure</option>
              <option value="probe-temporal-anchor">
                Temporal anchor — does it know the relevant now?
              </option>
              <option value="probe-elapsed">
                Elapsed — does it account for time passed?
              </option>
              <option value="probe-revalidation">
                Revalidation — does it re-check stale information?
              </option>
              <option value="probe-state-reconciliation">
                State reconciliation — does it act on updated state?
              </option>
              <option value="probe-historical-validity">
                Historical validity — does it preserve past truth as past?
              </option>
            </select>
          </label>
          <div className="form-pair">
            <label>
              Public source URL
              <input
                name="sourceUrl"
                type="url"
                required
                placeholder="https://…"
              />
            </label>
            <label>
              Date observed or published
              <input name="observedOn" type="date" required />
            </label>
          </div>
          <label>
            What does the source or observation appear to show?
            <textarea
              name="summary"
              required
              minLength={30}
              maxLength={1800}
              rows={6}
            />
          </label>
          <div className="form-pair">
            <label>
              Expected behavior, if firsthand
              <input name="expectedBehavior" maxLength={1200} />
            </label>
            <label>
              Actual behavior, if firsthand
              <input name="actualBehavior" maxLength={1200} />
            </label>
          </div>
          <label>
            Your relationship to this source
            <select name="relationship" required defaultValue="NONE">
              <option value="NONE">No relationship</option>
              <option value="USER">Product user</option>
              <option value="AUTHOR">Author or reporter</option>
              <option value="EMPLOYEE">Vendor employee</option>
              <option value="OTHER">Other relationship</option>
            </select>
          </label>
          <label>
            Anything reviewers should know?
            <textarea name="comments" maxLength={1200} rows={3} />
          </label>
          <fieldset>
            <legend>Optional public credit</legend>
            <div className="form-pair">
              <label>
                Name or alias
                <input name="publicName" maxLength={100} />
              </label>
              <label>
                Affiliation
                <input name="affiliation" maxLength={120} />
              </label>
            </div>
            <label className="checkbox-line">
              <input name="attributionConsent" type="checkbox" /> I consent to
              publishing that name and affiliation with the candidate.
            </label>
          </fieldset>
          <label className="honeypot" aria-hidden="true">
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
          {enabled ? (
            <div ref={widget} className="turnstile-slot" />
          ) : (
            <p className="form-unavailable">
              The public intake desk is being commissioned. The evidence watch
              continues to run automatically.
            </p>
          )}
          <button
            className="service-station-button"
            type="submit"
            disabled={!enabled || !token || state === 'sending'}
          >
            {state === 'sending' ? 'Sending…' : 'Send for review'}
          </button>
          {state === 'sent' && (
            <output>Thank you. Your lead entered the review queue.</output>
          )}
          {state === 'error' && (
            <p role="alert">
              The desk could not accept this submission. Nothing was recorded;
              please try again later.
            </p>
          )}
        </form>
        <aside className="contribution-rules">
          <h2>Before you pull in</h2>
          <ol>
            <li>Use a public link that a reviewer can open.</li>
            <li>Name the exact model and product surface when possible.</li>
            <li>
              Describe what happened; do not declare your own PASS or FAIL.
            </li>
            <li>
              Do not include secrets, private conversations, personal data, or
              uploaded files.
            </li>
            <li>
              Disclosure beats certainty: tell us if you wrote the source or
              work for the vendor.
            </li>
          </ol>
          <p>
            No email address is requested or published. Optional attribution
            appears only with explicit consent.
          </p>
        </aside>
      </section>
    </main>
  );
}
