import { fact, links, modelPage, lifecycle } from './common.mjs';
import { attr, tags, text } from '../html.mjs';

const endpointNames = new Map([
  ['v1/responses', 'responses'],
  ['v1/chat/completions', 'chat_completions'],
]);
const capabilityNames = new Map([
  ['Streaming', 'streaming'],
  ['Function calling', 'function_calling'],
  ['Structured outputs', 'structured_outputs'],
]);
const className = (node) => attr(node, 'class') ?? '';
const descendants = (node) => tags(node, 'div');

function structuredCompatibility(root, slug, documented) {
  const endpoints = [];
  for (const node of tags(root, 'div')) {
    const endpoint = endpointNames.get(text(node));
    if (!endpoint || !className(node).includes('text-xs')) continue;
    const card = node.parentNode?.parentNode;
    if (
      card &&
      descendants(card).some((child) =>
        className(child).split(/\s+/).includes('bg-primary-soft'),
      )
    )
      endpoints.push(endpoint);
  }
  const capabilities = [];
  for (const [label, capability] of capabilityNames) {
    const labelNode = tags(root, 'div').find(
      (node) =>
        text(node) === label && className(node).includes('font-semibold'),
    );
    if (labelNode && text(labelNode.parentNode) === `${label} Supported`)
      capabilities.push(capability);
  }
  const textLabel = tags(root, 'div').find(
    (node) =>
      text(node) === 'Text' && className(node).includes('font-semibold'),
  );
  if (textLabel && text(textLabel.parentNode) === 'Text Input and output')
    capabilities.push('text_input_output');
  if (documented) capabilities.push('snapshot_pinning');
  return {
    endpoints: [...new Set(endpoints)].sort((left, right) =>
      left.localeCompare(right),
    ),
    capabilities: [...new Set(capabilities)].sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}
export const index = (body, source) =>
  links(
    body,
    source,
    /^\/api\/docs\/models\/(?!all$|compare$|gpt$)[a-z0-9._-]+$/,
  ).filter((url) =>
    new RegExp(source.id_pattern).test(new URL(url).pathname.split('/').at(-1)),
  );
export function detail(body, source, url) {
  const { root, title, content } = modelPage(body);
  if (!title.endsWith(' Model | OpenAI API'))
    throw new Error('MODEL_PAGE_FORMAT_CHANGED');
  const slug = new URL(url).pathname.split('/').at(-1);
  const snapshotSection = content
    .slice(content.lastIndexOf('Snapshots'))
    .split('Rate limits')[0];
  const documented = snapshotSection.split(/\s+/).includes(slug);
  const compatibility = structuredCompatibility(root, slug, documented);
  return fact(source, {
    display_name: title.replace(/ Model \| OpenAI API$/, ''),
    api_model_id:
      documented && new RegExp(source.id_pattern).test(slug) ? slug : null,
    ...lifecycle(content),
    // Only the provider's structured supported cards count. Plain navigation
    // or an unsupported card never becomes a compatibility claim.
    endpoints: compatibility.endpoints,
    capabilities: compatibility.capabilities,
    identity_url: url,
  });
}
