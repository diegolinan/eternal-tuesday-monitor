import { createHash } from 'node:crypto';

const probeLexicon = {
  'probe-temporal-anchor': [
    'current date',
    'today',
    'what day',
    'time awareness',
    'temporal anchor',
    'system time',
    'current time',
    'date awareness',
  ],
  'probe-elapsed': [
    'elapsed',
    'time passed',
    'time has passed',
    'between sessions',
    'resumed session',
    'long-running',
    'duration',
    'minutes earlier',
    'hours earlier',
    'yesterday',
  ],
  'probe-revalidation': [
    'revalidate',
    'revalidation',
    'freshness',
    'stale',
    'outdated',
    'up to date',
    'browse again',
    'current evidence',
  ],
  'probe-state-reconciliation': [
    'state reconciliation',
    'changed state',
    'updated state',
    'superseded',
    'old state',
    'new evidence',
    'context update',
  ],
  'probe-historical-validity': [
    'historical validity',
    'previously true',
    'used to be',
    'past state',
    'historical context',
    'was valid',
    'no longer true',
  ],
};

const failureTerms = [
  'bug',
  'wrong',
  'incorrect',
  'fails',
  'failed',
  'failure',
  'blind',
  'does not know',
  "doesn't know",
  'stale',
  'outdated',
  'hallucinated',
  'as yesterday',
];
const successTerms = [
  'fixed',
  'resolved',
  'correctly',
  'supports',
  'now knows',
  'improved',
  'passes',
  'passed',
  'works',
];
const weakProbeTerms = new Set(['today', 'duration']);

export function normalizeUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('UNSAFE_SOURCE_URL');
  url.hash = '';
  for (const key of Array.from(url.searchParams.keys()))
    if (/^(?:utm_|fbclid|gclid|ref$|source$)/i.test(key))
      url.searchParams.delete(key);
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
  return url.href;
}

const clean = (value, max = 480) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

export function classifyText(value, hintedProbeIds = []) {
  const text = clean(value, 20000).toLowerCase();
  const matches = [];
  const probeIds = new Set(hintedProbeIds);
  for (const [probeId, terms] of Object.entries(probeLexicon))
    for (const term of terms)
      if (text.includes(term)) {
        probeIds.add(probeId);
        matches.push(term);
      }
  const hasFailure = failureTerms.some((term) => text.includes(term));
  const hasSuccess = successTerms.some((term) => text.includes(term));
  return {
    probeIds: [...probeIds].sort((left, right) => left.localeCompare(right)),
    matchingTerms: [...new Set(matches)].sort((left, right) =>
      left.localeCompare(right),
    ),
    sentiment:
      hasFailure && !hasSuccess
        ? 'FAILURE'
        : hasSuccess && !hasFailure
          ? 'SUCCESS'
          : 'UNCLEAR',
  };
}

export function inferClaimClass(sourceType, sentiment) {
  if (sourceType === 'OFFICIAL_SOURCE') return 'OFFICIAL_CAPABILITY_CLAIM';
  if (sourceType === 'RESEARCH_INDEX') return 'RESEARCH_RESULT';
  if (sentiment === 'FAILURE') return 'PUBLIC_FAILURE_REPORT';
  if (sentiment === 'SUCCESS') return 'PUBLIC_SUCCESS_REPORT';
  return 'UNCLEAR';
}

export function buildCandidate(input) {
  const sourceUrl = normalizeUrl(input.sourceUrl);
  const corpus = `${input.title ?? ''} ${input.excerpt ?? ''}`;
  const directClassification = classifyText(corpus);
  const hasStrongProbeMatch = directClassification.matchingTerms.some(
    (term) => !weakProbeTerms.has(term),
  );
  if (!hasStrongProbeMatch && !input.allowUnclassified) return null;
  const classification = classifyText(
    corpus,
    directClassification.probeIds.length || input.allowUnclassified
      ? (input.probeIds ?? [])
      : [],
  );
  const claimClass =
    input.claimClass ??
    inferClaimClass(input.sourceType, classification.sentiment);
  const identity = [sourceUrl, claimClass, ...classification.probeIds].join(
    '|',
  );
  return {
    schema_version: '1.0.0',
    id: `evcand-${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`,
    discovered_at: input.discoveredAt,
    retrieved_on: input.discoveredAt.slice(0, 10),
    source_type: input.sourceType,
    source_url: sourceUrl,
    source_title: clean(input.title, 300) || new URL(sourceUrl).hostname,
    source_excerpt:
      clean(input.excerpt, input.maxExcerpt ?? 480) ||
      'The source matched a configured Monitor evidence query.',
    published_on: /^\d{4}-\d{2}-\d{2}$/.test(input.publishedOn ?? '')
      ? input.publishedOn
      : null,
    vendor_ids: [...new Set(input.vendorIds ?? [])].sort((left, right) =>
      left.localeCompare(right),
    ),
    model_ids: [...new Set(input.modelIds ?? [])].sort((left, right) =>
      left.localeCompare(right),
    ),
    product_ids: [...new Set(input.productIds ?? [])].sort((left, right) =>
      left.localeCompare(right),
    ),
    surface_ids: [...new Set(input.surfaceIds ?? [])].sort((left, right) =>
      left.localeCompare(right),
    ),
    probe_ids: classification.probeIds,
    claim_class: claimClass,
    query_id: clean(input.queryId, 120),
    matching_terms: classification.matchingTerms,
    review_state: 'PENDING',
    review_reasons: [
      'A search match is a lead only; verify the source, exact model and product surface.',
      'A public claim cannot create a behavioral PASS or FAIL without accepted evidence.',
    ],
    public_attribution: input.publicAttribution ?? null,
  };
}

export function dedupeCandidates(
  candidates,
  excludedIds = new Set(),
  excludedUrls = new Set(),
) {
  const seen = new Set(excludedIds);
  const result = [];
  for (const candidate of candidates.filter(Boolean)) {
    if (seen.has(candidate.id) || excludedUrls.has(candidate.source_url))
      continue;
    seen.add(candidate.id);
    result.push(candidate);
  }
  return result.sort((left, right) => left.id.localeCompare(right.id));
}

export const evidenceProbeLexicon = probeLexicon;
