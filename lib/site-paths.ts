const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const canonicalSiteUrl =
  'https://diegolinan.github.io/eternal-tuesday-monitor/';
export const canonicalArticleUrl = `${canonicalSiteUrl}article/`;

export const siteBasePath = configuredBasePath.replace(/\/$/, '');

export function withBasePath(pathname: string) {
  if (!pathname.startsWith('/')) return pathname;
  if (!siteBasePath) return pathname;
  return pathname === '/' ? `${siteBasePath}/` : `${siteBasePath}${pathname}`;
}
