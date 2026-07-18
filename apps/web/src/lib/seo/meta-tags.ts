/**
 * SEO meta tag generators.
 *
 * Centralizes meta tag generation for consistent SEO across all pages.
 * Handles Open Graph, Twitter Cards, and standard meta tags.
 */

export interface SEOMetaTags {
  title: string;
  description: string;
  canonical?: string;
  keywords?: string[];
  image?: string;
  imageAlt?: string;
  type?: 'website' | 'article';
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
  noindex?: boolean;
  nofollow?: boolean;
}

/**
 * Generate complete meta tag array for TanStack Router head().
 * Includes title, description, Open Graph, Twitter Cards, and canonical.
 */
export function generateMetaTags(seo: SEOMetaTags) {
  const {
    title,
    description,
    canonical,
    keywords,
    image = 'https://flowerp.uz/og-image.png', // Default OG image
    imageAlt = 'FlowERP AI - Intelligent Logistics Command Center',
    type = 'website',
    publishedTime,
    modifiedTime,
    author,
    noindex = false,
    nofollow = false,
  } = seo;

  const tags: Array<Record<string, string>> = [];

  // Basic meta tags
  tags.push({ title });
  tags.push({ name: 'description', content: description });

  if (keywords && keywords.length > 0) {
    tags.push({ name: 'keywords', content: keywords.join(', ') });
  }

  if (author) {
    tags.push({ name: 'author', content: author });
  }

  // Robots
  if (noindex || nofollow) {
    const robotsContent = [noindex && 'noindex', nofollow && 'nofollow']
      .filter(Boolean)
      .join(', ');
    tags.push({ name: 'robots', content: robotsContent });
  }

  // Canonical URL
  if (canonical) {
    // Canonical is handled via link tag, not meta tag
    // Return it separately for link tag generation
  }

  // Open Graph
  tags.push({ property: 'og:title', content: title });
  tags.push({ property: 'og:description', content: description });
  tags.push({ property: 'og:type', content: type });
  if (canonical) {
    tags.push({ property: 'og:url', content: canonical });
  }
  tags.push({ property: 'og:image', content: image });
  tags.push({ property: 'og:image:alt', content: imageAlt });
  tags.push({ property: 'og:site_name', content: 'FlowERP AI' });
  tags.push({ property: 'og:locale', content: 'en_US' });

  if (type === 'article' && publishedTime) {
    tags.push({ property: 'article:published_time', content: publishedTime });
  }
  if (type === 'article' && modifiedTime) {
    tags.push({ property: 'article:modified_time', content: modifiedTime });
  }

  // Twitter Cards
  tags.push({ name: 'twitter:card', content: 'summary_large_image' });
  tags.push({ name: 'twitter:title', content: title });
  tags.push({ name: 'twitter:description', content: description });
  tags.push({ name: 'twitter:image', content: image });
  tags.push({ name: 'twitter:image:alt', content: imageAlt });
  // Add Twitter handle when available
  // tags.push({ name: 'twitter:site', content: '@flowerpai' });
  // tags.push({ name: 'twitter:creator', content: '@flowerpai' });

  return { meta: tags, canonical };
}

/**
 * Generate link tags for canonical, alternate languages, etc.
 */
export function generateLinkTags(seo: Pick<SEOMetaTags, 'canonical'>) {
  const links: Array<Record<string, string>> = [];

  if (seo.canonical) {
    links.push({ rel: 'canonical', href: seo.canonical });
  }

  // Add alternate language links when multi-language support is added
  // links.push({ rel: 'alternate', hreflang: 'en', href: `${canonical}?lang=en` });
  // links.push({ rel: 'alternate', hreflang: 'ru', href: `${canonical}?lang=ru` });
  // links.push({ rel: 'alternate', hreflang: 'uz', href: `${canonical}?lang=uz` });

  return links;
}

/**
 * Default SEO configuration for the landing page.
 */
export const defaultSEO: SEOMetaTags = {
  title: 'FlowERP AI — Intelligent Logistics Command Center',
  description:
    'The AI-native ERP for logistics teams. Unify orders, dispatch, tracking, fleet management, and finance in one intelligent command center. Ask your operations. Get answers in seconds.',
  canonical: 'https://flowerp.uz',
  keywords: [
    'logistics ERP',
    'fleet management software',
    'delivery management system',
    'dispatch software',
    'AI logistics',
    'transport management',
    'order tracking',
    'fleet tracking',
    'logistics AI assistant',
  ],
  image: 'https://flowerp.uz/og-image.png',
  imageAlt: 'FlowERP AI - Run every delivery from one intelligent command center',
  type: 'website',
};
