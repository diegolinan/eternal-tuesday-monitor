import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'dist/client');
const basePath = '/eternal-tuesday-monitor';
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
  if (monitorData.observations?.length !== 13)
    fail('static dataset must contain exactly 13 observations');
  const current = monitorData.observations?.filter((item) =>
    item.recordState.includes('CURRENT'),
  ).length;
  const historical = monitorData.observations?.filter((item) =>
    item.recordState.includes('HISTORICAL'),
  ).length;
  if (current !== 10)
    fail(
      `static dataset must contain 10 current observations, found ${current}`,
    );
  if (historical !== 3)
    fail(
      `static dataset must contain 3 historical observations, found ${historical}`,
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
    `${basePath}/assets/eternal-tuesday-banner.png`,
    `${basePath}/assets/same-sequence-different-time.png`,
    `${basePath}/assets/diagnostic-panel.png`,
    `${basePath}/assets/monitor-exhibit.png`,
    `href="${basePath}/"`,
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
  'Validated GitHub Pages export: 13 observations, HTML article, four figures, captions, and repository-prefixed internal assets.',
);
