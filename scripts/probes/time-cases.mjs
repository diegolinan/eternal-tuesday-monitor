import { createHash } from 'node:crypto';

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

export function expectedAnswer(referenceUtc, offsetHours) {
  const value = new Date(referenceUtc);
  if (Number.isNaN(value.valueOf()) || value.toISOString() !== referenceUtc || ![0, 14, -12].includes(offsetHours))
    throw new Error('INVALID_CASE');
  const local = new Date(value.valueOf() + offsetHours * 3600000);
  return {
    date: local.toISOString().slice(0, 10),
    weekday: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][local.getUTCDay()],
  };
}

export function makeCases(referenceUtc) {
  return [0, 14, -12].map((offsetHours, index) => {
    expectedAnswer(referenceUtc, offsetHours);
    return { id: `anchor-${index + 1}`, referenceUtc, offsetHours };
  });
}
