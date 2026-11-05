import { createHash } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Pinned official Quotable collection: reproducible even if its API is down.
export const quoteSource =
  'https://raw.githubusercontent.com/quotable-io/data/20037e8161167d25e971d2dcfe1ee0398eb8eb89/data/quotes.json';
export const sha256 = (text) =>
  createHash('sha256').update(text, 'utf8').digest('hex');

export function validateSignal(signal) {
  if (
    signal?.version !== 1 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(signal.edition) ||
    new Date(`${signal.edition}T00:00:00Z`).toISOString().slice(0, 10) !==
      signal.edition ||
    signal.source !== quoteSource ||
    typeof signal.quote?.id !== 'string' ||
    !signal.quote.id ||
    typeof signal.quote?.author !== 'string' ||
    !signal.quote.author.trim() ||
    typeof signal.quote?.text !== 'string' ||
    !signal.quote.text.trim() ||
    signal.quote.text.length > 5000 ||
    signal.sha256 !== sha256(signal.quote.text)
  )
    throw new Error('Invalid daily signal or SHA-256 mismatch');
  return signal;
}

export function selectSignal(quotes, edition) {
  if (
    !Array.isArray(quotes) ||
    !quotes.length ||
    quotes.some(
      (quote) =>
        typeof quote?._id !== 'string' ||
        !quote._id ||
        typeof quote.content !== 'string' ||
        !quote.content.trim() ||
        quote.content.length > 5000 ||
        typeof quote.author !== 'string' ||
        !quote.author.trim(),
    )
  )
    throw new Error('Invalid Quotable collection');
  const index =
    Number.parseInt(sha256(edition).slice(0, 8), 16) % quotes.length;
  const quote = quotes[index];
  return validateSignal({
    version: 1,
    edition,
    source: quoteSource,
    quote: { id: quote._id, text: quote.content, author: quote.author },
    sha256: sha256(quote.content),
  });
}

export async function updateDailySignal({
  file = resolve('public/data/daily-signal.json'),
  now = new Date(),
  fetchImpl = fetch,
} = {}) {
  const edition = now.toISOString().slice(0, 10);
  let previous;
  try {
    previous = validateSignal(JSON.parse(await readFile(file, 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (previous?.edition >= edition)
    return { status: 'unchanged', signal: previous };
  let signal;
  try {
    const response = await fetchImpl(quoteSource, {
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Quotable HTTP ${response.status}`);
    signal = selectSignal(await response.json(), edition);
  } catch (error) {
    if (!previous) throw error;
    return { status: 'retained', signal: previous, reason: error.message };
  }
  // Replace only after retrieval, validation and hashing all succeed.
  await writeFile(
    `${file}.tmp`,
    `${JSON.stringify(signal, null, 2)}\n`,
    'utf8',
  );
  await rename(`${file}.tmp`, file);
  return { status: 'updated', signal };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const result = await updateDailySignal();
  console.log(
    `Daily signal: ${result.status}; edition ${result.signal.edition} UTC`,
  );
  if (result.status === 'retained')
    console.warn(`::warning::Keeping previous daily signal: ${result.reason}`);
}
