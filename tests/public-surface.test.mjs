import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('the public status panel exposes status but no administrative actions', async () => {
  const source = await read('components/automation-status.tsx');
  assert.doesNotMatch(source, /Inspect discovery runs/i);
  assert.doesNotMatch(source, /Run five probes manually/i);
  assert.doesNotMatch(source, /evaluate-model\.yml/i);
  assert.match(source, /Last attempt/);
  assert.match(source, /Last scheduled run/);
  assert.match(source, /Today&apos;s scheduled run/);
  assert.match(source, /Next scheduled window/);
  assert.match(source, /WAITING FOR GITHUB/);
  assert.match(source, /eventLabel\(latest\.event\)/);
  assert.match(source, /useState<Date \| null>\(null\)/);
});

test('the product and surface station is driven by accepted observations', async () => {
  const source = await read('app/page.tsx');
  assert.match(source, /<SurfaceMap items=\{observations\}/);
  assert.doesNotMatch(source, /<strong>GPT-5\.6 SOL<\/strong>/);
  assert.match(
    source,
    /A catalog identity\s+never creates a product association/,
  );
  assert.match(source, /`\$\{product\.name\} \/ \$\{surface\.name\}`/);
  assert.match(source, /setScope\(nextScope\)/);
});

test('the model register is grouped by vendor and status', async () => {
  const source = await read('components/model-inventory.tsx');
  assert.match(source, /vendor-register-group/);
  assert.match(source, /registry-status-group/);
  assert.doesNotMatch(source, /visible\.slice\(0, 24\)/);
});
