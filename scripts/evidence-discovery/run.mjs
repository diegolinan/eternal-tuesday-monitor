import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { document, main, tags, text } from '../discovery/html.mjs';
import { buildCandidate, dedupeCandidates } from './core.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const readJson = async (file) =>
  JSON.parse(await readFile(path.join(root, file), 'utf8'));
const readLines = async (file) => {
  try {
    return (await readFile(path.join(root, file), 'utf8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .map(JSON.parse);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};
const option = (name) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? null : process.argv[i + 1];
};
const discoveryPath = option('--discovery-report') ?? '.discovery/run.json';
const now = process.env.ETM_EVIDENCE_NOW ?? new Date().toISOString();
if (Number.isNaN(new Date(now).valueOf()))
  throw new Error('ETM_EVIDENCE_NOW must be an ISO timestamp');

const [
  config,
  modelDiscoveryConfig,
  discovery,
  catalog,
  vendorsFile,
  productsFile,
  surfacesFile,
  acceptedSources,
  priorCandidates,
] = await Promise.all([
  readJson('config/evidence-discovery.json'),
  readJson('config/model-discovery.json'),
  readJson(discoveryPath),
  readJson('data/catalog/models.json'),
  readJson('data/catalog/vendors.json'),
  readJson('data/catalog/products.json'),
  readJson('data/catalog/surfaces.json'),
  readJson('data/sources/sources.json'),
  readLines('data/evidence-discovery/candidates.jsonl'),
]);
const vendorTerms = vendorsFile.vendors
  .filter((v) => v.id !== 'vendor-independent-research')
  .map((v) => [v.id, v.name.toLowerCase()]);
const modelTerms = catalog.models
  .map((m) => [m.id, String(m.api_model_id ?? m.name).toLowerCase()])
  .filter(([, term]) => term.length >= 4);
const productTerms = productsFile.products.map((p) => [
  p.id,
  p.name.toLowerCase(),
]);
const surfaceTerms = surfacesFile.surfaces.map((s) => [
  s.id,
  s.name.toLowerCase(),
]);
const inferIds = (value, terms) => {
  const lower = value.toLowerCase();
  return terms.filter(([, term]) => lower.includes(term)).map(([id]) => id);
};
const candidates = [];
const channels = [];

function add(input) {
  const corpus = `${input.title ?? ''} ${input.excerpt ?? ''}`;
  const candidate = buildCandidate({
    ...input,
    discoveredAt: now,
    maxExcerpt: config.max_excerpt_characters,
    vendorIds: input.vendorIds ?? inferIds(corpus, vendorTerms),
    modelIds: input.modelIds ?? inferIds(corpus, modelTerms),
    productIds: input.productIds ?? inferIds(corpus, productTerms),
    surfaceIds: input.surfaceIds ?? inferIds(corpus, surfaceTerms),
  });
  if (candidate) candidates.push(candidate);
}

async function officialSources() {
  if (!config.channels.official_sources) {
    channels.push({
      name: 'OFFICIAL_SOURCES',
      state: 'SKIPPED',
      searchedAt: null,
      resultsReviewed: 0,
      candidatesFound: 0,
      note: 'This channel is disabled by the reviewed search policy.',
    });
    return;
  }
  const evidenceSourceIds = new Set(
    modelDiscoveryConfig.sources
      .filter((source) => source.source_role === 'evidence-candidate')
      .map((source) => source.id),
  );
  const checks = discovery.source_checks.filter(
    (check) =>
      evidenceSourceIds.has(check.source_id) &&
      check.meaningful_change &&
      check.raw_snapshot_path,
  );
  for (const check of checks) {
    const bytes = await readFile(
      path.join(root, '.discovery/snapshots', check.raw_snapshot_path),
    );
    const body = gunzipSync(bytes).toString('utf8');
    const rootNode = document(body);
    const blocks = tags(main(rootNode), 'p').concat(
      tags(main(rootNode), 'li'),
      tags(main(rootNode), 'h2'),
      tags(main(rootNode), 'h3'),
    );
    const excerpt = blocks
      .map((node) => text(node))
      .filter(Boolean)
      .join(' ')
      .slice(0, 6000);
    add({
      sourceType: 'OFFICIAL_SOURCE',
      sourceUrl: check.url,
      title: check.source_id.replaceAll('-', ' '),
      excerpt,
      vendorIds: [check.vendor_id],
      queryId: `official-change:${check.source_id}`,
    });
  }
  channels.push({
    name: 'OFFICIAL_SOURCES',
    state: 'SEARCHED',
    searchedAt: now,
    resultsReviewed: checks.length,
    candidatesFound: candidates.length,
    note: checks.length
      ? 'Changed official pages were screened for Monitor probe terms.'
      : 'Official pages were checked; no changed page matched the evidence rules.',
  });
}

async function jsonFetch(url, headers = {}) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.json();
}

async function publicIssues() {
  const start = candidates.length;
  let reviewed = 0;
  if (!config.channels.public_issue_search) {
    channels.push({
      name: 'PUBLIC_ISSUES',
      state: 'SKIPPED',
      searchedAt: null,
      resultsReviewed: 0,
      candidatesFound: 0,
      note: 'This channel is disabled by the reviewed search policy.',
    });
    return;
  }
  if (!process.env.GITHUB_TOKEN) {
    channels.push({
      name: 'PUBLIC_ISSUES',
      state: 'NOT_CONFIGURED',
      searchedAt: null,
      resultsReviewed: 0,
      candidatesFound: 0,
      note: 'Public issue search did not run because its read token was unavailable.',
    });
    return;
  }
  try {
    for (const repository of config.public_issue_repositories)
      for (const query of config.queries) {
        const q = `${query.issue_terms ?? query.terms} repo:${repository} is:issue updated:>=${new Date(Date.parse(now) - config.lookback_days * 86400000).toISOString().slice(0, 10)}`;
        const data = await jsonFetch(
          `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=${config.max_results_per_query}`,
          {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'eternal-tuesday-monitor',
          },
        );
        for (const item of data.items ?? []) {
          reviewed++;
          add({
            sourceType: 'PUBLIC_ISSUE',
            sourceUrl: item.html_url,
            title: item.title,
            excerpt: item.body ?? item.title,
            publishedOn: item.created_at?.slice(0, 10),
            probeIds: query.probe_ids,
            queryId: `public-issue:${repository}:${query.id}`,
          });
        }
      }
    channels.push({
      name: 'PUBLIC_ISSUES',
      state: 'SEARCHED',
      searchedAt: now,
      resultsReviewed: reviewed,
      candidatesFound: candidates.length - start,
      note: 'Configured public issue trackers were searched. Matches remain unverified leads.',
    });
  } catch (error) {
    channels.push({
      name: 'PUBLIC_ISSUES',
      state: 'UNAVAILABLE',
      searchedAt: now,
      resultsReviewed: reviewed,
      candidatesFound: candidates.length - start,
      note: `The public issue search was incomplete (${String(error.message).slice(0, 80)}).`,
    });
  }
}

function openAlexAbstract(work) {
  const positions = [];
  for (const [word, indexes] of Object.entries(
    work.abstract_inverted_index ?? {},
  ))
    for (const index of indexes) positions[index] = word;
  return positions.filter(Boolean).join(' ');
}

async function research() {
  const start = candidates.length;
  let reviewed = 0;
  if (!config.channels.research_search) {
    channels.push({
      name: 'RESEARCH',
      state: 'SKIPPED',
      searchedAt: null,
      resultsReviewed: 0,
      candidatesFound: 0,
      note: 'This channel is disabled by the reviewed search policy.',
    });
    return;
  }
  try {
    for (const query of config.queries) {
      const params = new URLSearchParams({
        search: query.terms,
        filter: `from_publication_date:${new Date(Date.parse(now) - config.lookback_days * 86400000).toISOString().slice(0, 10)}`,
        'per-page': String(config.max_results_per_query),
        sort: 'publication_date:desc',
      });
      const data = await jsonFetch(`https://api.openalex.org/works?${params}`);
      for (const work of data.results ?? []) {
        reviewed++;
        add({
          sourceType: 'RESEARCH_INDEX',
          sourceUrl:
            work.primary_location?.landing_page_url ?? work.doi ?? work.id,
          title: work.display_name,
          excerpt: openAlexAbstract(work) || work.display_name,
          publishedOn: work.publication_date,
          probeIds: query.probe_ids,
          queryId: `openalex:${query.id}`,
        });
      }
    }
    channels.push({
      name: 'RESEARCH',
      state: 'SEARCHED',
      searchedAt: now,
      resultsReviewed: reviewed,
      candidatesFound: candidates.length - start,
      note: 'A public research index was searched. Index matches are not accepted findings.',
    });
  } catch (error) {
    channels.push({
      name: 'RESEARCH',
      state: 'UNAVAILABLE',
      searchedAt: now,
      resultsReviewed: reviewed,
      candidatesFound: candidates.length - start,
      note: `The research search was incomplete (${String(error.message).slice(0, 80)}).`,
    });
  }
}

async function generalWeb() {
  const start = candidates.length;
  let reviewed = 0;
  if (!config.channels.general_web_search) {
    channels.push({
      name: 'GENERAL_WEB',
      state: 'SKIPPED',
      searchedAt: null,
      resultsReviewed: 0,
      candidatesFound: 0,
      note: 'This channel is disabled by the reviewed search policy.',
    });
    return;
  }
  if (!process.env.BRAVE_SEARCH_API_KEY) {
    channels.push({
      name: 'GENERAL_WEB',
      state: 'NOT_CONFIGURED',
      searchedAt: null,
      resultsReviewed: 0,
      candidatesFound: 0,
      note: 'The broad web-search channel is not configured; other channels still run.',
    });
    return;
  }
  try {
    for (const query of config.queries) {
      const data = await jsonFetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query.terms)}&count=${config.max_results_per_query}&freshness=pw`,
        { 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY },
      );
      for (const item of data.web?.results ?? []) {
        reviewed++;
        add({
          sourceType: 'GENERAL_WEB',
          sourceUrl: item.url,
          title: item.title,
          excerpt: item.description ?? item.title,
          probeIds: query.probe_ids,
          queryId: `web:${query.id}`,
        });
      }
    }
    channels.push({
      name: 'GENERAL_WEB',
      state: 'SEARCHED',
      searchedAt: now,
      resultsReviewed: reviewed,
      candidatesFound: candidates.length - start,
      note: 'The broad public web was searched. Matches remain unverified leads.',
    });
  } catch (error) {
    channels.push({
      name: 'GENERAL_WEB',
      state: 'UNAVAILABLE',
      searchedAt: now,
      resultsReviewed: reviewed,
      candidatesFound: candidates.length - start,
      note: `The broad web search was incomplete (${String(error.message).slice(0, 80)}).`,
    });
  }
}

await officialSources();
await publicIssues();
await research();
await generalWeb();

const excludedIds = new Set(priorCandidates.map((item) => item.id));
const excludedUrls = new Set(
  acceptedSources.sources.map((item) => item.url).filter(Boolean),
);
const novel = dedupeCandidates(candidates, excludedIds, excludedUrls);
const unavailable = channels.filter(
  (item) => item.state === 'UNAVAILABLE',
).length;
const searched = channels.filter((item) => item.state === 'SEARCHED').length;
const report = {
  schema_version: '1.0.0',
  generated_at: now,
  state: novel.length
    ? 'CANDIDATES_FOUND'
    : searched === 0
      ? 'SOURCE_UNAVAILABLE'
      : unavailable
        ? 'PARTIAL'
        : 'SEARCHED_NO_NEW_EVIDENCE',
  channels,
  candidates: novel,
  safeguards: {
    content_treated_as_untrusted_data: true,
    automatic_verdicts: false,
    automatic_dataset_writes: false,
  },
};
await mkdir(path.join(root, '.evidence-discovery'), { recursive: true });
await writeFile(
  path.join(root, '.evidence-discovery/run.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  path.join(root, '.evidence-discovery/candidates.jsonl'),
  novel.map((item) => JSON.stringify(item)).join('\n') +
    (novel.length ? '\n' : ''),
);
console.log(
  JSON.stringify(
    { state: report.state, channels, candidates: novel.length },
    null,
    2,
  ),
);
