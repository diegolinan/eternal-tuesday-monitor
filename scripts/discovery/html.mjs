import { parse } from 'parse5';
export const document = (html) => parse(html);
export const attr = (node, name) =>
  node.attrs?.find((a) => a.name === name)?.value;
export function nodes(root, predicate) {
  const result = [];
  function visit(node) {
    if (predicate(node)) result.push(node);
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(root);
  return result;
}
export const tags = (root, name) => nodes(root, (n) => n.tagName === name);
export function text(node) {
  if (!node || ['script', 'style', 'nav'].includes(node.tagName)) return '';
  if (node.nodeName === '#text') return node.value;
  return (node.childNodes ?? [])
    .map(text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export const main = (root) => tags(root, 'main')[0] ?? root;
export const cells = (row) =>
  (row.childNodes ?? []).filter((n) => ['th', 'td'].includes(n.tagName));
