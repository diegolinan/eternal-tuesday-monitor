const markerPattern = /<!-- etm-evidence-review-due:([^>]*) -->/;

const reasonLabels = {
  LEGACY_RETEST_REQUIRED: 'Preserved record already requires a retest',
  AGE_THRESHOLD_EXCEEDED: 'Evidence exceeded its review window',
  EXPLICIT_RETEST_REQUIRED: 'A dated state event requires a retest',
  MODEL_SUPERSEDED: 'The tested model was superseded',
  SURFACE_DISCONTINUED: 'The tested surface was discontinued',
  METHODOLOGY_SUPERSEDED: 'The test method was superseded',
  SOURCE_UNAVAILABLE: 'A supporting source is unavailable',
  VERIFICATION_DATE_UNKNOWN: 'The verification date is not established',
};

function safeCell(value) {
  return String(value ?? 'NOT ESTABLISHED')
    .replaceAll('|', '\\|')
    .replaceAll(/\r?\n/g, ' ');
}

export function collectEvidenceReviewsDue(monitor) {
  return (monitor.observations ?? [])
    .filter((item) => item.currentSufficiency === 'RETEST_REQUIRED')
    .map((item) => ({
      id: item.id,
      vendor: item.vendor,
      product: item.product,
      surface: item.surface,
      model: item.model,
      probe: item.probe,
      applicability: item.applicability,
      evidenceVerifiedOn: item.evidenceVerifiedOn,
      reasons: item.sufficiencyReasons ?? [],
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function evidenceReviewMarker(items) {
  return `<!-- etm-evidence-review-due:${items.map((item) => item.id).join(',')} -->`;
}

export function readEvidenceReviewMarker(body = '') {
  const match = body.match(markerPattern);
  if (!match || !match[1]) return [];
  return match[1].split(',').filter(Boolean).sort();
}

export function buildEvidenceReviewIssue(monitor, items) {
  const rows = items.map((item) => {
    const reasons = item.reasons
      .map((reason) => reasonLabels[reason] ?? reason.replaceAll('_', ' '))
      .join('; ');
    return `| ${safeCell(item.id)} | ${safeCell(item.vendor)} / ${safeCell(item.product)} / ${safeCell(item.surface)} | ${safeCell(item.model)} | ${safeCell(item.probe)} | ${safeCell(item.applicability)} | ${safeCell(reasons)} |`;
  });

  return [
    evidenceReviewMarker(items),
    'The deterministic freshness evaluation currently marks these accepted records as requiring human review.',
    '',
    `Freshness evaluated on: **${safeCell(monitor.freshnessEvaluatedOn)}**`,
    '',
    '| Observation | Exact scope | Model | Probe | Applicability | Why review is due |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    'This reminder did not run a behavioral probe, create a PASS or FAIL, change an observation, or accept evidence. A person must decide whether an exact-model, exact-surface reproduction is possible and appropriate.',
  ].join('\n');
}
