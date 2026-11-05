const alphabet =
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Keep a growing, immutable prefix while the remaining characters scramble.
// Array.from preserves Unicode code points instead of splitting surrogate pairs.
export function scrambleQuote(text, hash, revealed, random = Math.random) {
  const characters = Array.from(text);
  const count = Math.min(characters.length, Math.max(0, Math.floor(revealed)));
  if (count === characters.length) return text;
  const progress = count / characters.length;
  const length = Math.max(
    characters.length,
    Math.ceil(hash.length + (characters.length - hash.length) * progress),
  );
  return Array.from({ length }, (_, index) =>
    index < count
      ? characters[index]
      : alphabet[Math.floor(random() * alphabet.length)],
  ).join('');
}
