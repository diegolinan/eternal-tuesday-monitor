import { fileURLToPath } from 'node:url';
import { loadReleases, resolveReleaseAsOf } from './lib/release-resolution.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const todayIndex = process.argv.indexOf('--today');
const today =
  todayIndex === -1
    ? new Date().toISOString().slice(0, 10)
    : process.argv[todayIndex + 1];
if (!/^\d{4}-\d{2}-\d{2}$/.test(today ?? '')) {
  console.error('--today must be YYYY-MM-DD');
  process.exit(1);
}
resolveReleaseAsOf(await loadReleases(root), today);
console.log(today);
