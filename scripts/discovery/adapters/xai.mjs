import { fact, links, modelPage, lifecycle } from './common.mjs';
import { attr, document, nodes, tags, text } from '../html.mjs';
export const index = (body, source) =>
  links(body, source, /^\/developers\/models\/grok-[a-z0-9._-]+$/);
export function detail(body, source, url) {
  const { root, title, content } = modelPage(body);
  const slug = new URL(url).pathname.split('/').at(-1);
  const exact =
    nodes(root, (n) => n.nodeName === '#text' && text(n).trim() === slug)
      .length > 0;
  if (!exact) throw new Error('MODEL_PAGE_FORMAT_CHANGED');
  const doc = document(body);
  const socialTitle = attr(
    tags(doc, 'meta').find((node) => attr(node, 'property') === 'og:title') ??
      {},
    'content',
  );
  const displayName =
    title.startsWith('Grok ') || !socialTitle
      ? title
      : socialTitle.split('|')[0].trim();
  return fact(source, {
    display_name: displayName,
    api_model_id: slug,
    identity_url: url,
    ...lifecycle(content),
  });
}
