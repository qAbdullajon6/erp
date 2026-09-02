/**
 * JSON-LD structured data generators for SEO.
 *
 * Structured data helps search engines understand page content and enables
 * rich results (rich snippets, knowledge panels, breadcrumbs in SERPs).
 *
 * https://schema.org/
 * https://developers.google.com/search/docs/appearance/structured-data
 */

import { siteConfig, socialProfiles } from '@/lib/site-config';

/**
 * Stable JSON-LD `@id` anchors. Giving Organization and WebSite their own
 * `@id` and cross-referencing them (WebSite.publisher -> Organization,
 * Organization.url -> WebSite) is what lets Google's Knowledge Graph resolve
 * "FlowERP" to one entity instead of guessing from the bare domain name —
 * flowerp.uz reads visually close to "flower" + ".uz", which is why Gemini
 * has confused it with an unrelated flower-delivery business. `@id` linking
 * plus `alternateName` are the structured-data levers available to correct
 * that; the rest is time and re-crawling.
 */
const ORGANIZATION_ID = `${siteConfig.url}/#organization`;
const WEBSITE_ID = `${siteConfig.url}/#website`;

interface ImageObjectSchema {
  '@type': 'ImageObject';
  url: string;
  width?: number;
  height?: number;
}

interface OrganizationSchema {
  '@context': 'https://schema.org';
  '@type': 'Organization';
  '@id': string;
  name: string;
  alternateName?: string;
  url: string;
  logo: ImageObjectSchema;
  description: string;
  contactPoint?: {
    '@type': 'ContactPoint';
    telephone: string;
    contactType: string;
    email?: string;
  };
  sameAs?: string[]; // Social media profiles
}

interface WebSiteSchema {
  '@context': 'https://schema.org';
  '@type': 'WebSite';
  '@id': string;
  name: string;
  alternateName?: string;
  url: string;
  description: string;
  inLanguage: string;
  publisher: { '@id': string };
}

interface SoftwareApplicationSchema {
  '@context': 'https://schema.org';
  '@type': 'SoftwareApplication';
  name: string;
  applicationCategory: string;
  operatingSystem: string;
  /// Optional: only emit a price once one is actually published on the page.
  offers?: {
    '@type': 'Offer';
    price: string;
    priceCurrency: string;
  };
  description: string;
  url: string;
  provider: { '@id': string };
  screenshot?: string;
  aggregateRating?: {
    '@type': 'AggregateRating';
    ratingValue: string;
    ratingCount: number;
  };
}

interface FAQPageSchema {
  '@context': 'https://schema.org';
  '@type': 'FAQPage';
  mainEntity: Array<{
    '@type': 'Question';
    name: string;
    acceptedAnswer: {
      '@type': 'Answer';
      text: string;
    };
  }>;
}

interface BreadcrumbListSchema {
  '@context': 'https://schema.org';
  '@type': 'BreadcrumbList';
  itemListElement: Array<{
    '@type': 'ListItem';
    position: number;
    name: string;
    item: string;
  }>;
}

/**
 * Generate Organization schema for homepage.
 * Tells Google who we are, where to find us, and how to contact us.
 */
export function getOrganizationSchema(): OrganizationSchema {
  const sameAs = socialProfiles();

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: siteConfig.name,
    alternateName: siteConfig.legalName,
    url: siteConfig.url,
    logo: {
      '@type': 'ImageObject',
      url: siteConfig.logo,
      width: 512,
      height: 512,
    },
    description:
      'FlowERP is a logistics operations platform: orders, dispatch, fleet, tracking and finance in one workspace.',
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: siteConfig.contact.phoneDisplay,
      contactType: 'Sales',
      email: siteConfig.contact.email,
    },
    // Omit entirely rather than publish `sameAs: []` — an empty array is a
    // meaningless "we checked and found nothing" signal to crawlers, not a
    // neutral default. Only appears once real social profiles are configured.
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

/**
 * Generate WebSite schema for the marketing domain.
 * Distinct from Organization: this describes the *site*, not the company,
 * and is the other half of the `@id` graph search engines use to resolve
 * ambiguous brand names to a single entity.
 */
export function getWebSiteSchema(): WebSiteSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: siteConfig.legalName,
    alternateName: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    inLanguage: 'en',
    publisher: { '@id': ORGANIZATION_ID },
  };
}

/**
 * Generate SoftwareApplication schema.
 * Helps Google understand that FlowERP is a software product.
 *
 * Deliberately not also emitting a `Product` schema for the same offering:
 * schema.org's own guidance is that SaaS is modeled as SoftwareApplication,
 * and `Product` is oriented at physical/e-commerce goods (it expects things
 * like `sku`/`gtin`/`review` that don't apply here). Publishing both for one
 * offering creates two competing entities instead of one clear one, which
 * works against disambiguation rather than for it.
 */
export function getSoftwareApplicationSchema(): SoftwareApplicationSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'FlowERP',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
    // No `offers`: structured data is supposed to describe what is on the
    // page, and the landing page no longer publishes a price. Emitting a
    // starting price of $99 that a visitor cannot find anywhere is both a
    // rich-results violation and a number we would have to honour.
    description:
      'Logistics operations platform. Orders, dispatch, fleet tracking and finance in one workspace, with an AI assistant across all of it.',
    url: siteConfig.url,
    provider: { '@id': ORGANIZATION_ID },
    // screenshot: 'https://flowerp.uz/screenshots/dashboard.png', // Add when available
    // aggregateRating: {
    //   '@type': 'AggregateRating',
    //   ratingValue: '4.8',
    //   ratingCount: 127,
    // },
  };
}

/**
 * Generate FAQPage schema from FAQ data.
 * Enables FAQ rich results in Google Search.
 */
export function getFAQPageSchema(
  faqs: Array<{ question: string; answer: string }>
): FAQPageSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

/**
 * Generate Breadcrumb schema for navigation.
 * Shows breadcrumb trail in search results.
 */
export function getBreadcrumbSchema(
  items: Array<{ name: string; url: string }>
): BreadcrumbListSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Serialize schema to JSON-LD script tag content.
 */
export function serializeSchema(schema: Record<string, unknown>): string {
  return JSON.stringify(schema);
}
