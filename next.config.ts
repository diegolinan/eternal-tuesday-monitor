import type { NextConfig } from 'next';

const isGitHubPages = process.env.ETM_BUILD_TARGET === 'github-pages';
const repositoryBasePath = '/eternal-tuesday-monitor';

const nextConfig: NextConfig = isGitHubPages
  ? {
      output: 'export',
      // Vinext's exporter currently redirects or 404s its own prerender requests
      // when basePath is set. assetPrefix plus withBasePath() produce the same
      // public URLs without putting the prerender server behind that prefix.
      assetPrefix: repositoryBasePath,
    }
  : {};

export default nextConfig;
