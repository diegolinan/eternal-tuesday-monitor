import { document, main, tags, attr, text } from '../html.mjs';
export function fact(source, fields) {
  return {
    vendor_id: source.vendor_id,
    display_name: null,
    api_model_id: null,
    family: null,
    version: null,
    released_on: null,
    release_state: 'DISCOVERED',
    api_state: 'API_UNKNOWN',
    account_access: 'UNKNOWN',
    endpoints: [],
    capabilities: [],
    aliases: [],
    supersedes_model_id: null,
    channel: 'UNKNOWN',
    ...fields,
  };
}
export function links(body, source, pathPattern) {
  const root = main(document(body));
  return [
    ...new Set(
      tags(root, 'a')
        .map((a) => attr(a, 'href'))
        .filter(Boolean)
        .map((href) => new URL(href, source.url))
        .filter(
          (url) =>
            source.allowed_domains.includes(url.hostname) &&
            pathPattern.test(url.pathname),
        )
        .map((url) => {
          url.hash = '';
          return url.href;
        }),
    ),
  ];
}
export function modelPage(body) {
  const doc = document(body);
  const root = main(doc);
  const title =
    text(tags(root, 'h1')[0]) ||
    attr(
      tags(doc, 'meta').find((n) => attr(n, 'property') === 'og:title') ?? {},
      'content',
    );
  if (!title) throw new Error('MODEL_TITLE_MISSING');
  return { root, title, content: text(root) };
}
export function lifecycle(content) {
  // Restricted to this model's article, never a global navigation banner.
  return {
    api_state:
      /(?:API.{0,90}(?:coming|soon|not yet|later)|(?:coming|soon).{0,90}API)/i.test(
        content,
      )
        ? 'API_PENDING'
        : 'API_UNKNOWN',
    release_state:
      /\b(?:this model is|status[: ]+)\s*(?:retired|shut down)\b/i.test(content)
        ? 'RETIRED'
        : /\b(?:this model is|status[: ]+)\s*deprecated\b/i.test(content) ||
            /\bDeprecated\b/.test(content.slice(0, 160))
          ? 'DEPRECATED'
          : 'DISCOVERED',
    channel: /\bpreview model\b/i.test(content) ? 'PREVIEW' : 'UNKNOWN',
  };
}
