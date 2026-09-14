import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'dist/client');
const targetFlag = process.argv.indexOf('--target');
const target = targetFlag >= 0 ? process.argv[targetFlag + 1] : null;

if (!['github-pages', 'vercel'].includes(target))
  throw new Error('--target must be github-pages or vercel');

if (target === 'github-pages') {
  const prefixedFrameworkAssets = path.join(
    output,
    'eternal-tuesday-monitor/_next',
  );
  await cp(prefixedFrameworkAssets, path.join(output, '_next'), {
    recursive: true,
  });
}

for (const route of ['changelog', 'contribute', 'contributors', 'models']) {
  await mkdir(path.join(output, route), { recursive: true });
  await cp(
    path.join(output, `${route}.html`),
    path.join(output, route, 'index.html'),
  );
  await cp(
    path.join(output, `${route}.txt`),
    path.join(output, route, 'index.txt'),
  );
}

console.log(`Prepared dist/client as the ${target} static artifact root.`);
