import { fact, links, modelPage, lifecycle } from './common.mjs';
import { nodes, text } from '../html.mjs';
export const index = (body, source) =>
  links(body, source, /^\/developers\/models\/grok-[a-z0-9._-]+$/);
export function detail(body, source, url) {
  const { root, title, content } = modelPage(body);
  if (!title.startsWith('Grok ')) throw new Error('MODEL_PAGE_FORMAT_CHANGED');
  const slug = new URL(url).pathname.split('/').at(-1);
  const exact =
    nodes(root, (n) => n.nodeName === '#text' && text(n).trim() === slug)
      .length > 0;
  return fact(source, {
    display_name: title,
    api_model_id: exact ? slug : null,
    identity_url: url,
    ...lifecycle(content),
  });
}
