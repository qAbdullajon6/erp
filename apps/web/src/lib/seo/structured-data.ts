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

interface OrganizationSchema {
  '@context': 'https://schema.org';
  '@type': 'Organization';
  name: string;
  url: string;
  logo: string;
  description: string;
  contactPoint?: {
    '@type': 'ContactPoint';
    telephone: string;
    contactType: string;
    email?: string;
  };
  sameAs?: string[]; // Social media profiles
}

interface SoftwareApplicationSchema {
  '@context': 'https://schema.org';
  '@type': 'SoftwareApplication';
  name: string;
  applicationCategory: string;
  operatingSystem: string;
  offers: {
    '@type': 'Offer';
    price: string;
    priceCurrency: string;
  };
  description: string;
  url: string;
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
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.name,
    url: siteConfig.url,
    logo: siteConfig.logo,
    description:
      'FlowERP orchestrates logistics operations with AI. Orders, dispatch, fleet, and finance unified in one command center.',
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: siteConfig.contact.phoneDisplay,
      contactType: 'Sales',
      email: siteConfig.contact.email,
    },
    sameAs: socialProfiles(),
  };
}

/**
 * Generate SoftwareApplication schema.
 * Helps Google understand that FlowERP is a software product.
 */
export function getSoftwareApplicationSchema(): SoftwareApplicationSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'FlowERP',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
    offers: {
      '@type': 'Offer',
      price: '99', // Starting price
      priceCurrency: 'USD',
    },
    description:
      'AI-powered logistics management platform. Orders, dispatch, fleet tracking, and finance in one unified system. 14-day free trial, no credit card required.',
    url: siteConfig.url,
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
