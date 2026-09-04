import type { Metadata } from 'next';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Root, RootContent } from 'mdast';
import type { Plugin } from 'unified';
import {
  canonicalArticleUrl,
  canonicalSiteUrl,
  withBasePath,
} from '@/lib/site-paths';
import articleMarkdown from '../../content/articles/your-ai-lives-in-an-eternal-tuesday.md?raw';

export const metadata: Metadata = {
  title: 'Your AI Lives in an Eternal Tuesday',
  description:
    'What happens when the conversation continues but the world does not wait.',
  alternates: { canonical: canonicalArticleUrl },
  openGraph: {
    type: 'article',
    url: canonicalArticleUrl,
    title: 'Your AI Lives in an Eternal Tuesday',
    description:
      'What happens when the conversation continues but the world does not wait.',
  },
};

export const dynamic = 'force-static';

const figures = new Map([
  [
    '[INSERT BANNER: eternal_tuesday_banner_1672x941.png]',
    {
      src: '/assets/eternal-tuesday-banner.png',
      alt: 'A mid-century advertisement for a continuity computer under clocks labeled Tuesday, Monday and Saturday',
      caption: 'Operational AI Literacy #01',
      consumeFollowingCaption: false,
    },
  ],
  [
    '[INSERT IMAGE: eternal_tuesday_image2_sequence_elapsed.png]',
    {
      src: '/assets/same-sequence-different-time.png',
      alt: 'The same conversation sequence separated by different amounts of elapsed time',
      caption:
        'Conversation order preserves sequence. It does not necessarily preserve elapsed time.',
      consumeFollowingCaption: true,
    },
  ],
  [
    '[INSERT IMAGE: eternal_tuesday_image3_diagnostic_probes.png]',
    {
      src: '/assets/diagnostic-panel.png',
      alt: 'Five external diagnostic probes for observable temporal continuity behavior',
      caption:
        'Five questions I use to diagnose temporal continuity failures from the outside. They are not claims about five independent components inside the product.',
      consumeFollowingCaption: true,
    },
  ],
  [
    '[INSERT IMAGE: eternal_tuesday_image4_monitor_exhibit.png]',
    {
      src: '/assets/monitor-exhibit.png',
      alt: 'The Eternal Tuesday Monitor public continuity exhibit',
      caption:
        'The Eternal Tuesday Monitor will track observable behavior by product and surface. Capability, evidence type and verification date remain separate.',
      consumeFollowingCaption: true,
    },
  ],
]);

function plainText(node: RootContent): string {
  if ('value' in node && typeof node.value === 'string') return node.value;
  if ('children' in node && Array.isArray(node.children)) {
    return node.children
      .map((child) => plainText(child as RootContent))
      .join('');
  }
  return '';
}

const remarkArticleAssets: Plugin<[], Root> = () => (tree) => {
  const visitLinks = (node: Root | RootContent) => {
    if (node.type === 'link' && node.url === 'MONITOR_URL') {
      node.url = canonicalSiteUrl;
    }
    if ('children' in node && Array.isArray(node.children)) {
      node.children.forEach((child) => visitLinks(child as RootContent));
    }
  };

  visitLinks(tree);

  const transformed: RootContent[] = [];
  for (let index = 0; index < tree.children.length; index += 1) {
    const node = tree.children[index];
    const figure =
      node.type === 'paragraph' ? figures.get(plainText(node)) : undefined;
    if (!figure) {
      transformed.push(node);
      continue;
    }

    transformed.push({
      type: 'paragraph',
      children: [
        {
          type: 'image',
          url: withBasePath(figure.src),
          alt: figure.alt,
          title: figure.caption,
        },
      ],
    });

    if (figure.consumeFollowingCaption) index += 1;
  }
  tree.children = transformed;
};

const markdownComponents: Components = {
  p({ node, children }) {
    const containsFigure = node?.children.some(
      (child) => child.type === 'element' && child.tagName === 'img',
    );
    return containsFigure ? <>{children}</> : <p>{children}</p>;
  },
  img({ src, alt, title }) {
    return (
      <figure className="article-figure">
        <img src={src} alt={alt ?? ''} />
        {title && <figcaption>{title}</figcaption>}
      </figure>
    );
  },
  a({ href, children }) {
    const external =
      href?.startsWith('http') && !href.startsWith(canonicalSiteUrl);
    return (
      <a
        href={href}
        {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      >
        {children}
      </a>
    );
  },
};

export default function ArticlePage() {
  return (
    <main className="article-page">
      <header className="article-masthead">
        <a href={withBasePath('/')}>← The Eternal Tuesday Monitor</a>
        <span>Operational AI Literacy #01</span>
      </header>
      <article className="article-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkArticleAssets]}
          components={markdownComponents}
        >
          {articleMarkdown}
        </ReactMarkdown>
      </article>
      <footer className="article-footer">
        <a href={withBasePath('/')}>Return to the Monitor</a>
        <span>Evidence reviewed through September 3, 2026</span>
      </footer>
    </main>
  );
}
