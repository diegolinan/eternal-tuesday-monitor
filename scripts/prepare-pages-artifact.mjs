import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'dist/client');
const prefixedFrameworkAssets = path.join(
  output,
  'eternal-tuesday-monitor/_next',
);

await cp(prefixedFrameworkAssets, path.join(output, '_next'), {
  recursive: true,
});
await mkdir(path.join(output, 'article'), { recursive: true });
await cp(
  path.join(output, 'article.html'),
  path.join(output, 'article/index.html'),
);
await cp(
  path.join(output, 'article.rsc'),
  path.join(output, 'article/index.rsc'),
);

console.log('Prepared dist/client as the GitHub Pages artifact root.');
