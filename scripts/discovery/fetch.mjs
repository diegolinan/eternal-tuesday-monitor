import { createHash } from 'node:crypto';

export function allowedUrl(value, source) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !source.allowed_domains.includes(url.hostname)
  ) {
    throw new Error('URL_OUTSIDE_SOURCE_ALLOWLIST');
  }
  return url;
}

// No generation, no arbitrary crawling, no credentials in URLs or artifacts.
export async function readOfficial(
  url,
  source,
  config,
  fetcher = fetch,
  credentials = process.env,
) {
  let current = allowedUrl(url, source);
  const headers = {
    Accept:
      source.type === 'authenticated-model-list'
        ? 'application/json'
        : 'text/html',
    'Accept-Language': 'en',
  };
  if (source.credential_env) {
    const key = credentials[source.credential_env];
    if (!key) throw new Error('CREDENTIAL_NOT_CONFIGURED');
    if (source.adapter === 'anthropic-api') {
      headers['x-api-key'] = key;
      headers['anthropic-version'] = '2023-06-01';
    } else if (source.adapter === 'google-api') headers['x-goog-api-key'] = key;
    else headers.Authorization = `Bearer ${key}`;
  }
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetcher(current.href, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(config.timeout_ms),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const target = allowedUrl(
        new URL(response.headers.get('location'), current).href,
        source,
      );
      if (source.credential_env && target.origin !== current.origin)
        throw new Error('AUTH_REDIRECT_BLOCKED');
      current = target;
      continue;
    }
    if (!response.ok)
      throw new Error(
        [401, 403].includes(response.status)
          ? 'ACCOUNT_ACCESS_DENIED'
          : `HTTP_${response.status}`,
      );
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > config.max_response_bytes) {
        await reader.cancel();
        throw new Error('RESPONSE_TOO_LARGE');
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    return {
      url: current.href,
      body: bytes.toString('utf8'),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }
  throw new Error('REDIRECT_LIMIT');
}
