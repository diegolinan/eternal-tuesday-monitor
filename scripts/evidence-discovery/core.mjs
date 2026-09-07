import { createHash } from 'node:crypto';
import { normalizePublicSourceUrl } from '../../lib/public-source-url.mjs';

const probeLexicon = {
  'probe-temporal-anchor': [
    'current date',
    'what day',
    'time awareness',
    'temporal anchor',
    'system time',
    'current time',
    'date awareness',
    'wrong day',
    'wrong date',
    'midnight rollover',
    're-dated',
  ],
  'probe-elapsed': [
    'time passed',
    'time has passed',
    'resumed session',
    'minutes earlier',
    'hours earlier',
    'days later',
    'weeks later',
    'yesterday',
  ],
  'probe-revalidation': [
    'revalidate',
    'revalidation',
    'freshness',
    'stale information',
    'stale context',
    'stale memory',
    'stale knowledge',
    'outdated information',
    'outdated data',
    'outdated knowledge',
    'up to date',
    'browse again',
    'current evidence',
    'without verifying',
    'verify current',
    'check current',
  ],
  'probe-state-reconciliation': [
    'state reconciliation',
    'changed state',
    'updated state',
    'superseded',
    'old state',
    'new evidence',
    'context update',
    'operative context',
    'stale context',
    'stale memory',
    'prior state',
    'treated answered',
  ],
  'probe-historical-validity': [
    'historical validity',
    'previously true',
    'used to be',
    'past state',
    'historical context',
    'was valid',
    'no longer true',
    'past event',
    'prior session',
    're-dated',
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
const behavioralActorTerms = [
  'assistant',
  'agent',
  'model',
  'claude',
  'chatgpt',
  'gemini',
  'grok',
  'cursor',
  'fable',
];
const behavioralInteractionTerms = [
  'answer',
  'conversation',
  'context',
  'memory',
  'message',
  'prompt',
  'reply',
  'report',
  'response',
  'said',
  'session',
  'stated',
  'told',
];

const behavioralOutcomeTerms = [
  'answered',
  'asserted',
  'assumed',
  'believed',
  'claimed',
  'concluded',
  'continued the conversation',
  'described',
  'executed tools',
  'failed to consult',
  'failed to distinguish',
  'failed to notice',
  'failed to remember',
  'failed to revalidate',
  'failed to verify',
  'forgot',
  'ignores',
  'ignored',
  'invented',
  'misdated',
  're-dated',
  'references "the test',
  'reported',
  'reports',
  'said',
  'says',
  'stated',
  'treated answered',
  'told',
  'used stale',
  'uses stale',
  'without verifying',
  'wrong current date',
  'wrong current time',
  'wrong date',
  'wrong day',
  'wrong time',
];
const decisiveProbeTerms = new Set([
  're-dated',
  'without verifying',
  'wrong date',
  'wrong day',
]);

const hasBehavioralContext = (value) => {
  const text = value.toLowerCase();
  return (
    behavioralActorTerms.some((term) => text.includes(term)) &&
    behavioralInteractionTerms.some((term) => text.includes(term))
  );
};

const hasBehavioralOutcome = (value) => {
  const text = value.toLowerCase();
  return behavioralOutcomeTerms.some((term) => text.includes(term));
};

const hasBehavioralActor = (value) => {
  const text = value.toLowerCase();
  return behavioralActorTerms.some((term) => text.includes(term));
};

export function normalizeUrl(value) {
  try {
    return normalizePublicSourceUrl(value);
  } catch {
    throw new Error('UNSAFE_SOURCE_URL');
  }
}

const clean = (value, max = 480) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const normalizeIdentityText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function inferIdentityIds(value, terms, excludedTerms = new Set()) {
  const normalizedValue = ` ${normalizeIdentityText(value)} `;
  return [
    ...new Set(
      terms
        .filter(([, term]) => {
          const normalizedTerm = normalizeIdentityText(term);
          return (
            normalizedTerm.length >= 4 &&
            !excludedTerms.has(normalizedTerm) &&
            normalizedValue.includes(` ${normalizedTerm} `)
          );
        })
        .map(([id]) => id),
    ),
  ];
}

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
  const sourceUrl = input.sourceUrl ? normalizeUrl(input.sourceUrl) : null;
  const identityKey = sourceUrl ?? clean(input.identityKey, 160);
  if (!identityKey) throw new Error('CANDIDATE_IDENTITY_REQUIRED');
  const screeningPolicyVersion =
    input.screeningPolicyVersion ?? 'ETM-EVIDENCE-1.4';
  const corpus = `${input.title ?? ''} ${input.excerpt ?? ''}`;
  const directClassification = classifyText(corpus);
  const hasStrongProbeMatch = directClassification.matchingTerms.length > 0;
  const contextualOnlyMatch = !directClassification.matchingTerms.some((term) =>
    decisiveProbeTerms.has(term),
  );
  if (!hasStrongProbeMatch && !input.allowUnclassified) return null;
  if (
    ['PUBLIC_ISSUE', 'GENERAL_WEB'].includes(input.sourceType) &&
    (!hasBehavioralContext(corpus) || !hasBehavioralOutcome(corpus)) &&
    !input.allowUnclassified
  )
    return null;
  if (
    ['PUBLIC_ISSUE', 'GENERAL_WEB'].includes(input.sourceType) &&
    contextualOnlyMatch &&
    (!hasBehavioralActor(input.title ?? '') ||
      !hasBehavioralOutcome(input.title ?? '')) &&
    !input.allowUnclassified
  )
    return null;
  const classification = input.allowUnclassified
    ? classifyText(corpus, input.probeIds ?? [])
    : directClassification;
  const claimClass =
    input.claimClass ??
    inferClaimClass(input.sourceType, classification.sentiment);
  const identity = [
    identityKey,
    claimClass,
    ...classification.probeIds,
    screeningPolicyVersion,
  ].join('|');
  return {
    schema_version: '1.0.0',
    id: `evcand-${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`,
    discovered_at: input.discoveredAt,
    retrieved_on: input.discoveredAt.slice(0, 10),
    source_type: input.sourceType,
    source_url: sourceUrl,
    submission_fingerprint: input.submissionFingerprint ?? null,
    source_title:
      clean(input.title, 300) ||
      (sourceUrl
        ? new URL(sourceUrl).hostname
        : 'Firsthand observation without a public source'),
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
    screening_policy_version: screeningPolicyVersion,
    matching_terms: classification.matchingTerms,
    review_state: 'PENDING',
    review_reasons: [
      sourceUrl
        ? 'A search match is a lead only; verify the source, exact model and product surface.'
        : 'A firsthand report without a public source is a lead only; reproduce it before considering evidence.',
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
