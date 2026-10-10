const markerPattern = /<!-- etm-evidence-review-due:([^>]*) -->/;

export function parseEvidenceReviewIssue(issue) {
  const body = String(issue?.body ?? '');
  const marker = body.match(markerPattern);
  if (!marker) return null;

  const expectedIds = marker[1].split(',').filter(Boolean);
  const evaluatedOn = body.match(/Freshness evaluated on: \*\*(\d{4}-\d{2}-\d{2})\*\*/)?.[1] ?? null;
  const items = body.split(/\r?\n/)
    .filter((line) => /^\|\s*obs-[^|]+\|/.test(line))
    .map((line) => {
      const cells = line.slice(1, -1).split(/(?<!\\)\|/).map((cell) =>
        cell.trim().replaceAll('\\|', '|'),
      );
      if (cells.length !== 6) throw new Error('RETEST_ISSUE_MALFORMED');
      const [id, scope, model, probe, applicability, reason] = cells;
      return { id, scope, model, probe, applicability, reason };
    });

  if (!evaluatedOn ||
      items.length !== expectedIds.length ||
      items.some((item) => !expectedIds.includes(item.id)) ||
      new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error('RETEST_ISSUE_MALFORMED');
  }
  return {
    evaluatedOn,
    issueUrl: issue.html_url,
    items,
  };
}
