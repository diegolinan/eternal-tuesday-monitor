/**
 * Distinguish source destinations without changing the accepted source URLs.
 * @param {string[]} urls
 */
export function sourceLinks(urls) {
  const links = [...new Set(urls)].map((url) => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, '');
    let label;
    if (/\/models(?:\/all)?$/.test(path)) label = 'Model Catalog';
    else if (/\/models\/[^/]+$/.test(path)) label = 'Model Details';
    else if (path.endsWith('/model-config')) label = 'Model Configuration';
    else label = `${parsed.hostname}${path}`;
    return { url, label, path };
  });
  return links.map(({ url, label, path }) => ({
    url,
    label:
      links.filter((link) => link.label === label).length > 1
        ? `${label} · ${new URL(url).hostname}${path}`
        : label,
  }));
}
