import { fact, links, modelPage, lifecycle } from './common.mjs';
export const index = (body, source) =>
  links(
    body,
    source,
    /^\/api\/docs\/models\/(?!all$|compare$|gpt$)[a-z0-9._-]+$/,
  ).filter((url) =>
    new RegExp(source.id_pattern).test(new URL(url).pathname.split('/').at(-1)),
  );
export function detail(body, source, url) {
  const { title, content } = modelPage(body);
  if (!title.endsWith(' Model | OpenAI API'))
    throw new Error('MODEL_PAGE_FORMAT_CHANGED');
  const slug = new URL(url).pathname.split('/').at(-1);
  const snapshotSection = content
    .slice(content.lastIndexOf('Snapshots'))
    .split('Rate limits')[0];
  const documented = snapshotSection.split(/\s+/).includes(slug);
  return fact(source, {
    display_name: title.replace(/ Model \| OpenAI API$/, ''),
    api_model_id:
      documented && new RegExp(source.id_pattern).test(slug) ? slug : null,
    ...lifecycle(content),
    endpoints: content.includes('v1/responses') ? ['responses'] : [],
    identity_url: url,
  });
}
