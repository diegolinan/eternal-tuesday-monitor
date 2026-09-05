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

// Public GET-only retrieval. No generation, arbitrary crawling, or provider credentials.
export async function readOfficial(
  url,
  source,
  config,
  fetcher = fetch,
) {
  let current = allowedUrl(url, source);
  const headers = {
    Accept:
      source.type === 'research-feed'
        ? 'application/atom+xml, application/xml, text/xml'
        : 'text/html',
    'Accept-Language': 'en',
  };
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
      fetched_at: new Date().toISOString(),
      etag: response.headers.get('etag'),
      last_modified: response.headers.get('last-modified'),
      content_type: response.headers.get('content-type'),
      http_status: response.status,
    };
  }
  throw new Error('REDIRECT_LIMIT');
}
