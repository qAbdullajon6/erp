/**
 * SEO meta tag generators.
 *
 * Centralizes meta tag generation for consistent SEO across all pages.
 * Handles Open Graph, Twitter Cards, and standard meta tags.
 */

import { siteConfig } from '@/lib/site-config';

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
    image = siteConfig.ogImage, // Default OG image
    imageAlt = `${siteConfig.legalName} — Intelligent Logistics Command Center`,
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
  tags.push({ property: 'og:image:width', content: '1200' });
  tags.push({ property: 'og:image:height', content: '630' });
  tags.push({ property: 'og:image:alt', content: imageAlt });
  tags.push({ property: 'og:site_name', content: siteConfig.legalName });
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
  if (siteConfig.social.twitter) {
    const handle = `@${siteConfig.social.twitter.replace(/^https?:\/\/(x|twitter)\.com\//, '').replace(/^@/, '')}`;
    tags.push({ name: 'twitter:site', content: handle });
    tags.push({ name: 'twitter:creator', content: handle });
  }

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
  title: 'FlowERP — The AI operating system for logistics',
  description:
    'FlowERP unifies orders, dispatch, fleet, and finance into one live command center — with an AI copilot that answers questions, catches problems, and takes action in seconds. 14-day free trial.',
  canonical: siteConfig.url,
  keywords: [
    'logistics management software',
    'fleet management system',
    'delivery management platform',
    'dispatch optimization software',
    'AI logistics assistant',
    'transport management system',
    'logistics ERP',
    'delivery tracking software',
    'fleet tracking system',
    'operations management software',
    'logistics automation',
    'route optimization software',
  ],
  image: siteConfig.ogImage,
  imageAlt: 'FlowERP — Your logistics operation, orchestrated by AI',
  type: 'website',
};
