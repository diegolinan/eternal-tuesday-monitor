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
await mkdir(path.join(output, 'changelog'), { recursive: true });
await cp(
  path.join(output, 'changelog.html'),
  path.join(output, 'changelog/index.html'),
);
await cp(
  path.join(output, 'changelog.txt'),
  path.join(output, 'changelog/index.txt'),
);
await mkdir(path.join(output, 'contribute'), { recursive: true });
await cp(
  path.join(output, 'contribute.html'),
  path.join(output, 'contribute/index.html'),
);
await cp(
  path.join(output, 'contribute.txt'),
  path.join(output, 'contribute/index.txt'),
);

console.log('Prepared dist/client as the GitHub Pages artifact root.');
