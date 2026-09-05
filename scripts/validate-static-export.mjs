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
  requireFile('changelog/index.html'),
  requireFile('changelog/index.txt'),
  requireFile('_next/static'),
  requireFile('.nojekyll'),
  requireFile('data/monitor.json'),
  requireFile('data/changelog.json'),
  requireFile('favicon.svg'),
  requireFile('favicon-32.png'),
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
} catch (error) {
  fail(`unable to validate static dataset: ${error.message}`);
}

for (const relativePath of ['index.html', 'changelog/index.html']) {
  try {
    const html = await read(relativePath);
    if (!html.includes(`${basePath}/_next/`))
      fail(`${relativePath}: framework assets are not base-path prefixed`);
    if (!html.includes(`rel="canonical" href="${canonicalUrl}`))
      fail(`${relativePath}: canonical metadata does not use GitHub Pages`);
    if (relativePath === 'index.html' && !html.includes(`${basePath}/favicon`))
      fail('index.html: favicon is not repository-prefix aware');
    if (html.includes(openAIPrototypeHost))
      fail(`${relativePath}: contains the historical OpenAI prototype host`);
    if (
      html.includes('Inspect discovery runs') ||
      html.includes('Run five probes manually')
    )
      fail(`${relativePath}: contains a public administrative action`);
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
  const changelog = await read('changelog/index.html');
  if (!changelog.includes('Monitor changelog'))
    fail('changelog HTML is missing its public heading');
  const publicChanges = JSON.parse(await read('data/changelog.json'));
  if (!Array.isArray(publicChanges.events) || publicChanges.events.length === 0)
    fail('compiled changelog contains no domain events');
} catch (error) {
  fail(`unable to validate rendered changelog: ${error.message}`);
}

if (failures.length) {
  console.error(
    `Static export validation failed with ${failures.length} issue(s):`,
  );
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log(
  `Validated GitHub Pages export: ${monitorData.observations.length} observations matching canonical data, public domain changelog, four figures, and repository-prefixed internal assets.`,
);
