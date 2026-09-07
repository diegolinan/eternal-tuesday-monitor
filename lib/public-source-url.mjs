const trackingParameter = /^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid|ref|source)$/i;

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part)))
    return false;
  const octets = parts.map(Number);
  if (octets.some((value) => value > 255)) return true;
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isPrivateHostname(hostname) {
  const bare = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    bare === 'localhost' ||
    bare.endsWith('.localhost') ||
    bare === '::1' ||
    bare.startsWith('fc') ||
    bare.startsWith('fd') ||
    bare.startsWith('fe8') ||
    bare.startsWith('fe9') ||
    bare.startsWith('fea') ||
    bare.startsWith('feb') ||
    isPrivateIpv4(bare)
  );
}

export function normalizePublicSourceUrl(
  value,
  { rejectPrivate = false } = {},
) {
  if (typeof value !== 'string' || value.length > 2048)
    throw new Error('INVALID_SOURCE_URL');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('INVALID_SOURCE_URL');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !url.hostname ||
    (rejectPrivate && isPrivateHostname(url.hostname))
  )
    throw new Error('INVALID_SOURCE_URL');
  url.hash = '';
  const parameterNames = [];
  url.searchParams.forEach((_value, key) => parameterNames.push(key));
  for (const key of parameterNames)
    if (trackingParameter.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
  if (url.href.length > 2048) throw new Error('INVALID_SOURCE_URL');
  return url.href;
}
