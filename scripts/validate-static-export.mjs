import { access, readFile, mkdtemp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'dist/client');
const basePath = '/eternal-tuesday-monitor';
const canonicalUrl = 'https://diegolinan.github.io/eternal-tuesday-monitor/';
const openAIPrototypeHost = 'chatgpt.site';
const failures = [];

const fail = (message) => failures.push(message);
const read = async (relativePath) =>
  readFile(path.join(output, relativePath), 'utf8');

async function requireFile(relativePath) {
  try {
    await access(path.join(output, relativePath));
  } catch {
    fail(`missing static export file: ${relativePath}`);
  }
}

await Promise.all([
  requireFile('index.html'),
  requireFile('article/index.html'),
  requireFile('article/index.txt'),
  requireFile('_next/static'),
  requireFile('.nojekyll'),
  requireFile('data/monitor.json'),
  requireFile('assets/eternal-tuesday-banner.png'),
  requireFile('assets/diagnostic-panel.png'),
  requireFile('assets/monitor-exhibit.png'),
  requireFile('assets/same-sequence-different-time.png'),
]);

let monitorData;
try {
  monitorData = JSON.parse(await read('data/monitor.json'));
  // The maintenance count must be allowed to change as evidence ages.
  // Recompile for the artifact's date and compare every field instead.
  const comparisonDirectory = await mkdtemp(path.join(tmpdir(), 'etm-export-'));
  const expectedPath = path.join(comparisonDirectory, 'expected.json');
  const compilation = spawnSync(
    process.execPath,
    [
      'scripts/compile-monitor-view.mjs',
      '--as-of',
      monitorData.freshnessEvaluatedOn,
      '--output',
      expectedPath,
    ],
    { cwd: root, encoding: 'utf8' },
  );
  if (compilation.status !== 0)
    fail(
      `artifact evaluation date cannot be reproduced: ${compilation.stderr}`,
    );
  else if (
    JSON.stringify(monitorData) !==
    JSON.stringify(JSON.parse(await readFile(expectedPath, 'utf8')))
  )
    fail(
      'static dataset differs from canonical evidence evaluated at its declared date',
    );
  if (monitorData.articlePath !== '/article/')
    fail('compiled articlePath must point to /article/');
} catch (error) {
  fail(`unable to validate static dataset: ${error.message}`);
}

for (const relativePath of ['index.html', 'article/index.html']) {
  try {
    const html = await read(relativePath);
    if (!html.includes(`${basePath}/_next/`))
      fail(`${relativePath}: framework assets are not base-path prefixed`);
    if (!html.includes(`rel="canonical" href="${canonicalUrl}`))
      fail(`${relativePath}: canonical metadata does not use GitHub Pages`);
    if (html.includes(openAIPrototypeHost))
      fail(`${relativePath}: contains the historical OpenAI prototype host`);
    const unsafeLocalReference =
      /(?:href|src)=["']\/(?!eternal-tuesday-monitor(?:\/|["']))/g.exec(html);
    if (unsafeLocalReference)
      fail(
        `${relativePath}: root-relative reference escapes repository base path: ${unsafeLocalReference[0]}`,
      );
  } catch (error) {
    fail(`${relativePath}: unable to inspect HTML (${error.message})`);
  }
}

try {
  const article = await read('article/index.html');
  const requiredFragments = [
    '<h1',
    '<blockquote',
    '<pre',
    '¹',
    'Conversation order preserves sequence.',
    'Five questions I use to diagnose temporal continuity failures',
    'The Eternal Tuesday Monitor will track observable behavior',
    'Operational AI Literacy #01',
    'Published September 7, 2026.',
    'Evidence reviewed through September 3, 2026.',
    `${basePath}/assets/eternal-tuesday-banner.png`,
    `${basePath}/assets/same-sequence-different-time.png`,
    `${basePath}/assets/diagnostic-panel.png`,
    `${basePath}/assets/monitor-exhibit.png`,
    `href="${canonicalUrl}"`,
  ];
  for (const fragment of requiredFragments) {
    if (!article.includes(fragment))
      fail(`article HTML is missing ${JSON.stringify(fragment)}`);
  }
  if (article.includes('MONITOR_URL'))
    fail('article HTML contains unresolved MONITOR_URL');
  if (
    article.includes('[INSERT IMAGE:') ||
    article.includes('[INSERT BANNER:')
  ) {
    fail('article HTML contains unresolved image placeholders');
  }
} catch (error) {
  fail(`unable to validate rendered article: ${error.message}`);
}

if (failures.length) {
  console.error(
    `Static export validation failed with ${failures.length} issue(s):`,
  );
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log(
  `Validated GitHub Pages export: ${monitorData.observations.length} observations matching canonical data, HTML article, four figures, captions, and repository-prefixed internal assets.`,
);
