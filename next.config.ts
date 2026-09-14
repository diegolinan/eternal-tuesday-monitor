import type { NextConfig } from 'next';

const buildTarget = process.env.ETM_BUILD_TARGET;
const isGitHubPages = buildTarget === 'github-pages';
const isStaticExport = isGitHubPages || buildTarget === 'vercel';
const repositoryBasePath = '/eternal-tuesday-monitor';

const nextConfig: NextConfig = isStaticExport
  ? {
      output: 'export',
      // Vinext's exporter currently redirects or 404s its own prerender requests
      // when basePath is set. assetPrefix plus withBasePath() produce the same
      // public URLs without putting the prerender server behind that prefix.
      ...(isGitHubPages ? { assetPrefix: repositoryBasePath } : {}),
    }
  : {};

export default nextConfig;
