'use client';

import Script from 'next/script';
import { SyntheticEvent, useEffect, useMemo, useRef, useState } from 'react';
import { withBasePath } from '@/lib/site-paths';
import modelOptions from '@/public/data/model-options.json';

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: Record<string, unknown>,
      ) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
  }
}

type Phase = 'editing' | 'reviewing' | 'sending' | 'sent' | 'error';
type DeskState = 'checking' | 'open' | 'closed' | 'unavailable';
type Submission = Record<string, string | boolean | null>;

const endpoint = process.env.NEXT_PUBLIC_CONTRIBUTION_ENDPOINT ?? '';
const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
const formSchemaVersion = '2.1.0';
const otherVendor = '__OTHER_VENDOR__';
const otherModel = '__OTHER_MODEL__';
const unknownModel = '__NOT_SPECIFIED__';

const errors: Record<string, string> = {
  CHALLENGE_FAILED:
    'The human check expired or could not be confirmed. Please complete it again.',
  CHALLENGE_UNAVAILABLE:
    'The human check is temporarily unavailable. Please try again shortly.',
  FORM_VERSION_EXPIRED:
    'This form was updated while you had it open. Reload the page before sending.',
  INTAKE_BUSY:
    'The service desk is receiving unusually heavy traffic. Please try again later.',
  INTAKE_CLOSED: 'The service desk is temporarily closed.',
  INTAKE_UNAVAILABLE:
    'The service desk cannot safely accept a lead right now. Nothing was recorded.',
  INVALID_ACTUAL_BEHAVIOR:
    'Describe the actual behavior in at least 15 characters.',
  INVALID_DATE: 'Use a real date that is not in the future.',
  INVALID_EXPECTED_BEHAVIOR:
    'Describe the expected behavior in at least 15 characters.',
  INVALID_REPRODUCTION_STEPS:
    'Provide enough reproduction detail for a reviewer to follow the steps.',
  INVALID_SUMMARY:
    'Describe the lead in at least 30 characters and no more than 1,800.',
  INVALID_SOURCE_URL:
    'Use a public HTTPS link. Local or private-network links cannot be accepted.',
  MISSING_CHALLENGE: 'Complete the human check before sending.',
  RATE_LIMITED:
    'Too many attempts were made from this connection. Please wait and try again.',
};

const fieldText = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
};
const localToday = () => {
  const now = new Date();
  return new Date(now.valueOf() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
};

function FieldMark({ optional = false }: { optional?: boolean }) {
  return (
    <span className={`field-mark ${optional ? 'optional' : 'required'}`}>
      {optional ? 'OPTIONAL' : 'REQUIRED'}
    </span>
  );
}

function PreviewLine({
  label,
  value,
}: {
  label: string;
  value: string | boolean | null;
}) {
  if (value === '' || value === null || value === false) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value === true ? 'Yes' : String(value)}</dd>
    </div>
  );
}

export default function ContributePage() {
  const formRef = useRef<HTMLFormElement>(null);
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const [token, setToken] = useState('');
  const [scriptReady, setScriptReady] = useState(false);
  const [desk, setDesk] = useState<DeskState>(
    endpoint && siteKey ? 'checking' : 'unavailable',
  );
  const [phase, setPhase] = useState<Phase>('editing');
  const [submissionType, setSubmissionType] = useState('FOUND_SOURCE');
  const [vendorChoice, setVendorChoice] = useState('');
  const [modelChoice, setModelChoice] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [consent, setConsent] = useState(false);
  const [preview, setPreview] = useState<Submission | null>(null);
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState<string | null>(null);

  const selectedVendor = modelOptions.vendors.find(
    (vendor) => vendor.id === vendorChoice,
  );
  const filteredModels = useMemo(() => {
    const query = modelSearch.trim().toLocaleLowerCase();
    return (selectedVendor?.models ?? []).filter(
      (model) =>
        model.id === modelChoice ||
        `${model.name} ${model.apiModelId ?? ''}`
          .toLocaleLowerCase()
          .includes(query),
    );
  }, [modelChoice, modelSearch, selectedVendor]);

  const discardChallenge = () => {
    if (widgetId.current && window.turnstile) {
      window.turnstile.remove(widgetId.current);
      widgetId.current = undefined;
    }
    setToken('');
  };

  useEffect(() => {
    if (!endpoint || !siteKey) return;
    const controller = new AbortController();
    fetch(`${endpoint}/status`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('status');
        const status = (await response.json()) as {
          open?: boolean;
          formSchemaVersion?: string;
        };
        setDesk(
          status.open && status.formSchemaVersion === formSchemaVersion
            ? 'open'
            : 'closed',
        );
      })
      .catch(() => setDesk('unavailable'));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (
      phase !== 'reviewing' ||
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
      'expired-callback': () => {
        setToken('');
        setMessage(
          'The human check expired. Complete it again before sending.',
        );
      },
      'error-callback': () => {
        setToken('');
        setMessage('The human check could not load. Please try again.');
      },
      action: 'evidence_submission',
      theme: 'light',
    });
  }, [phase, scriptReady]);

  function buildSubmission(form: HTMLFormElement): Submission | null {
    const data = new FormData(form);
    const vendorMode = vendorChoice === otherVendor ? 'OTHER' : 'CATALOG';
    const vendor =
      vendorMode === 'OTHER'
        ? fieldText(data, 'otherVendor')
        : (selectedVendor?.name ?? '');
    const selectedModel = selectedVendor?.models.find(
      (model) => model.id === modelChoice,
    );
    const modelMode =
      modelChoice === otherModel
        ? 'OTHER'
        : modelChoice === unknownModel
          ? 'NOT_SPECIFIED'
          : 'CATALOG';
    const model =
      modelMode === 'OTHER'
        ? fieldText(data, 'otherModel')
        : modelMode === 'NOT_SPECIFIED'
          ? 'Exact model not known'
          : (selectedModel?.name ?? '');
    if (!vendor || !model) return null;
    return {
      formSchemaVersion,
      requestId: crypto.randomUUID(),
      catalogSchemaVersion: modelOptions.catalogSchemaVersion,
      catalogCheckedThrough: modelOptions.catalogCheckedThrough,
      submissionType,
      vendorMode,
      vendorId: vendorMode === 'CATALOG' ? vendorChoice : '',
      vendor,
      modelMode,
      modelId: modelMode === 'CATALOG' ? modelChoice : '',
      model,
      productSurface: fieldText(data, 'productSurface'),
      probeId: fieldText(data, 'probeId'),
      sourceUrl: fieldText(data, 'sourceUrl'),
      observedOn: fieldText(data, 'observedOn'),
      summary: fieldText(data, 'summary'),
      expectedBehavior: fieldText(data, 'expectedBehavior'),
      actualBehavior: fieldText(data, 'actualBehavior'),
      reproductionSteps: fieldText(data, 'reproductionSteps'),
      relationship: fieldText(data, 'relationship'),
      comments: fieldText(data, 'comments'),
      publicName: consent ? fieldText(data, 'publicName') : '',
      affiliation: consent ? fieldText(data, 'affiliation') : '',
      attributionConsent: consent,
      website: fieldText(data, 'website'),
    };
  }

  function review(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (desk !== 'open') return;
    const next = buildSubmission(event.currentTarget);
    if (!next) {
      setMessage('Choose a vendor and model option before continuing.');
      return;
    }
    setPreview(next);
    setMessage('');
    setPhase('reviewing');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function editAgain() {
    if (widgetId.current && window.turnstile) {
      window.turnstile.remove(widgetId.current);
      widgetId.current = undefined;
    }
    setToken('');
    setMessage('');
    setPhase('editing');
  }

  async function send() {
    if (!preview || !token || phase !== 'reviewing') return;
    setPhase('sending');
    setMessage('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preview, turnstileToken: token }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        receiptId?: string | null;
        state?: string;
      };
      if (!response.ok) throw new Error(result.error ?? 'UNKNOWN');
      setReceipt(result.receiptId ?? null);
      setMessage(
        result.state === 'ALREADY_UNDER_REVIEW'
          ? 'That source is already under review, so no duplicate lead was created.'
          : 'Thank you. Your lead is queued for human review.',
      );
      setPhase('sent');
    } catch (error) {
      const code = error instanceof Error ? error.message : 'UNKNOWN';
      setMessage(
        errors[code] ??
          'The desk could not safely accept this submission. Nothing was recorded; please try again later.',
      );
      discardChallenge();
      setPhase('error');
    }
  }

  function startAgain() {
    formRef.current?.reset();
    if (widgetId.current && window.turnstile) {
      window.turnstile.remove(widgetId.current);
      widgetId.current = undefined;
    }
    setSubmissionType('FOUND_SOURCE');
    setVendorChoice('');
    setModelChoice('');
    setModelSearch('');
    setConsent(false);
    setPreview(null);
    setReceipt(null);
    setToken('');
    setMessage('');
    setPhase('editing');
  }

  const formDisabled = phase !== 'editing' && phase !== 'error';
  const available = desk === 'open';

  return (
    <main className="contribute-page" id="main-content">
      {endpoint && siteKey && (
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
            Found a credible public source, or saw a product mishandle time,
            stale facts, changed state or historical truth? Send us the lead.
          </p>
        </div>
      </section>
      <section className="contribute-layout">
        <div>
          <form ref={formRef} className="contribution-form" onSubmit={review}>
            <div className="form-intro">
              <strong>A lead is not a verdict.</strong>
              <p>
                Every submission is checked by a person. It cannot directly
                change the Monitor or create a PASS or FAIL.
              </p>
              <p className="field-key">
                <FieldMark /> must be completed · <FieldMark optional /> helps
                the reviewer when available
              </p>
            </div>
            <fieldset disabled={formDisabled} className="form-fields">
              <label>
                What are you sending? <FieldMark />
                <select
                  name="submissionType"
                  required
                  value={submissionType}
                  onChange={(event) => setSubmissionType(event.target.value)}
                >
                  <option value="FOUND_SOURCE">A public source I found</option>
                  <option value="FIRSTHAND_OBSERVATION">
                    A firsthand observation
                  </option>
                </select>
              </label>
              <div className="form-pair">
                <label>
                  Vendor <FieldMark />
                  <select
                    required
                    value={vendorChoice}
                    onChange={(event) => {
                      setVendorChoice(event.target.value);
                      setModelChoice('');
                      setModelSearch('');
                    }}
                  >
                    <option value="">Choose a vendor…</option>
                    {modelOptions.vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </option>
                    ))}
                    <option value={otherVendor}>Other / not listed</option>
                  </select>
                </label>
                {vendorChoice === otherVendor && (
                  <label>
                    Vendor name <FieldMark />
                    <input
                      name="otherVendor"
                      required
                      maxLength={80}
                      placeholder="Type the vendor name"
                    />
                  </label>
                )}
              </div>
              <div className="model-picker">
                <label>
                  Find a model <FieldMark optional />
                  <input
                    type="search"
                    value={modelSearch}
                    onChange={(event) => setModelSearch(event.target.value)}
                    disabled={!selectedVendor}
                    placeholder={
                      selectedVendor
                        ? 'Filter by name or model ID…'
                        : 'Choose a catalog vendor first'
                    }
                  />
                </label>
                <label>
                  Exact model <FieldMark />
                  <select
                    required
                    value={modelChoice}
                    onChange={(event) => setModelChoice(event.target.value)}
                  >
                    <option value="">Choose a model option…</option>
                    {filteredModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                        {model.apiModelId && model.apiModelId !== model.name
                          ? ` · ${model.apiModelId}`
                          : ''}
                      </option>
                    ))}
                    <option value={otherModel}>Other / not listed</option>
                    <option value={unknownModel}>
                      I don’t know the exact model
                    </option>
                  </select>
                </label>
                {modelChoice === otherModel && (
                  <label>
                    Model name <FieldMark />
                    <input
                      name="otherModel"
                      required
                      maxLength={120}
                      placeholder="Type the exact model if possible"
                    />
                  </label>
                )}
                <small>
                  Catalog checked through{' '}
                  {modelOptions.catalogCheckedThrough ?? 'an unavailable date'}.
                  “Other” means you know the model but it is not listed; “I
                  don’t know” preserves the uncertainty.
                </small>
              </div>
              <label>
                Product and surface <FieldMark />
                <input
                  name="productSurface"
                  required
                  maxLength={160}
                  placeholder="Example: Claude Code / resumed terminal session"
                />
              </label>
              <label>
                Which Monitor question? <FieldMark />
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
                  Public source URL{' '}
                  <FieldMark
                    optional={submissionType === 'FIRSTHAND_OBSERVATION'}
                  />
                  <input
                    name="sourceUrl"
                    type="url"
                    required={submissionType === 'FOUND_SOURCE'}
                    maxLength={2048}
                    pattern="https://.*"
                    placeholder={
                      submissionType === 'FIRSTHAND_OBSERVATION'
                        ? 'Optional for firsthand reports'
                        : 'https://…'
                    }
                  />
                  {submissionType === 'FIRSTHAND_OBSERVATION' && (
                    <small>
                      Without a public source, this remains a firsthand lead
                      until someone independently reproduces it.
                    </small>
                  )}
                </label>
                <label>
                  Date observed or published <FieldMark />
                  <input
                    name="observedOn"
                    type="date"
                    required
                    max={localToday()}
                  />
                </label>
              </div>
              <label>
                What does it appear to show? <FieldMark />
                <textarea
                  name="summary"
                  required
                  minLength={30}
                  maxLength={1800}
                  rows={6}
                />
              </label>
              {submissionType === 'FIRSTHAND_OBSERVATION' && (
                <fieldset className="firsthand-fields">
                  <legend>Firsthand account</legend>
                  <div className="form-pair">
                    <label>
                      Expected behavior <FieldMark />
                      <textarea
                        name="expectedBehavior"
                        required
                        minLength={15}
                        maxLength={1200}
                        rows={3}
                      />
                    </label>
                    <label>
                      Actual behavior <FieldMark />
                      <textarea
                        name="actualBehavior"
                        required
                        minLength={15}
                        maxLength={1200}
                        rows={3}
                      />
                    </label>
                  </div>
                  <label>
                    Steps to reproduce <FieldMark />
                    <textarea
                      name="reproductionSteps"
                      required
                      minLength={20}
                      maxLength={1800}
                      rows={5}
                    />
                  </label>
                </fieldset>
              )}
              {submissionType !== 'FIRSTHAND_OBSERVATION' && (
                <>
                  <input type="hidden" name="expectedBehavior" value="" />
                  <input type="hidden" name="actualBehavior" value="" />
                  <input type="hidden" name="reproductionSteps" value="" />
                </>
              )}
              <label>
                Your relationship to this source <FieldMark />
                <select name="relationship" required defaultValue="NONE">
                  <option value="NONE">No relationship</option>
                  <option value="USER">Product user</option>
                  <option value="AUTHOR">Author or reporter</option>
                  <option value="EMPLOYEE">Vendor employee</option>
                  <option value="OTHER">Other relationship</option>
                </select>
              </label>
              <label>
                Anything reviewers should know? <FieldMark optional />
                <textarea name="comments" maxLength={1200} rows={3} />
              </label>
              <fieldset>
                <legend>Optional public credit</legend>
                <div className="form-pair">
                  <label>
                    Name or alias <FieldMark optional={!consent} />
                    <input
                      name="publicName"
                      required={consent}
                      maxLength={100}
                    />
                  </label>
                  <label>
                    Affiliation <FieldMark optional />
                    <input name="affiliation" maxLength={120} />
                  </label>
                </div>
                <label className="checkbox-line">
                  <input
                    name="attributionConsent"
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />{' '}
                  I consent to publishing that name and affiliation with the
                  candidate.
                </label>
              </fieldset>
              <label className="honeypot" aria-hidden="true">
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </fieldset>
            {desk !== 'open' && (
              <output className="form-unavailable">
                {desk === 'checking'
                  ? 'Checking whether the service desk is open…'
                  : desk === 'closed'
                    ? 'The service desk is temporarily closed.'
                    : 'The service desk is temporarily unavailable. Nothing can be submitted right now.'}
              </output>
            )}
            {(phase === 'editing' || phase === 'error') && (
              <button
                className="service-station-button"
                type="submit"
                disabled={!available}
              >
                Review your lead
              </button>
            )}
          </form>

          {preview && (phase === 'reviewing' || phase === 'sending') && (
            <section
              className="submission-preview"
              aria-labelledby="preview-title"
            >
              <p className="section-code">FINAL CHECK · NOTHING SENT YET</p>
              <h2 id="preview-title">Review your lead</h2>
              <dl>
                <PreviewLine
                  label="Type"
                  value={
                    preview.submissionType === 'FOUND_SOURCE'
                      ? 'Public source'
                      : 'Firsthand observation'
                  }
                />
                <PreviewLine label="Vendor" value={preview.vendor} />
                <PreviewLine label="Model" value={preview.model} />
                <PreviewLine
                  label="Product / surface"
                  value={preview.productSurface}
                />
                <PreviewLine label="Monitor question" value={preview.probeId} />
                <PreviewLine label="Source" value={preview.sourceUrl} />
                <PreviewLine label="Date" value={preview.observedOn} />
                <PreviewLine label="Summary" value={preview.summary} />
                <PreviewLine
                  label="Expected"
                  value={preview.expectedBehavior}
                />
                <PreviewLine label="Actual" value={preview.actualBehavior} />
                <PreviewLine
                  label="Reproduction"
                  value={preview.reproductionSteps}
                />
                <PreviewLine
                  label="Relationship"
                  value={preview.relationship}
                />
                <PreviewLine label="Reviewer note" value={preview.comments} />
                <PreviewLine
                  label="Public credit"
                  value={
                    preview.attributionConsent
                      ? `${preview.publicName}${preview.affiliation ? ` · ${preview.affiliation}` : ''}`
                      : ''
                  }
                />
              </dl>
              <div ref={widget} className="turnstile-slot" />
              {message && <p role="alert">{message}</p>}
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={editAgain}
                  disabled={phase === 'sending'}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="service-station-button"
                  onClick={send}
                  disabled={!token || phase === 'sending'}
                >
                  {phase === 'sending' ? 'Sending…' : 'Send for review'}
                </button>
              </div>
            </section>
          )}

          {phase === 'sent' && (
            <section className="submission-receipt">
              <p className="section-code">SERVICE DESK RECEIPT</p>
              <h2>Lead received</h2>
              <p>{message}</p>
              {receipt && (
                <p className="receipt-code">
                  <span>Internal receipt</span>
                  <strong>{receipt}</strong>
                </p>
              )}
              <p>
                A person must verify the source and evidence scope before the
                Monitor can change.
              </p>
              <button
                type="button"
                className="secondary-button"
                onClick={startAgain}
              >
                Send another lead
              </button>
            </section>
          )}
          {phase === 'error' && message && (
            <p className="form-error" role="alert">
              {message}
            </p>
          )}
        </div>
        <aside className="contribution-rules">
          <h2>Before you pull in</h2>
          <ol>
            <li>
              Include a public link when reporting a source. A firsthand
              observation may be sent without one, but it cannot become accepted
              evidence until it is independently reproduced.
            </li>
            <li>
              Choose the exact model when known; uncertainty is acceptable and
              remains visible.
            </li>
            <li>
              Describe what happened; do not declare your own PASS or FAIL.
            </li>
            <li>
              Do not include secrets, private conversations, personal data or
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
