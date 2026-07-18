#!/usr/bin/env tsx
/**
 * Generate sitemap.xml for SEO.
 *
 * This script generates a sitemap from the route tree and writes it to public/sitemap.xml.
 * Run before build: npm run generate-sitemap
 *
 * Add to package.json scripts:
 *   "generate-sitemap": "tsx scripts/generate-sitemap.ts"
 *   "prebuild": "npm run generate-sitemap"
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SitemapURL {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

const SITE_URL = 'https://flowerp.uz';

/**
 * Define all public routes with SEO metadata.
 * Authenticated routes (/app/*) are excluded from sitemap.
 */
const routes: SitemapURL[] = [
  {
    loc: '/',
    lastmod: new Date().toISOString().split('T')[0],
    changefreq: 'weekly',
    priority: 1.0,
  },
  // Future routes (add as they're implemented):
  // { loc: '/pricing', changefreq: 'monthly', priority: 0.9 },
  // { loc: '/features', changefreq: 'monthly', priority: 0.8 },
  // { loc: '/case-studies', changefreq: 'monthly', priority: 0.7 },
  // { loc: '/integrations', changefreq: 'monthly', priority: 0.7 },
  // { loc: '/security', changefreq: 'monthly', priority: 0.6 },
  // { loc: '/about', changefreq: 'monthly', priority: 0.5 },
  // { loc: '/blog', changefreq: 'daily', priority: 0.7 },
];

/**
 * Generate XML sitemap content.
 */
function generateSitemap(urls: SitemapURL[]): string {
  const urlElements = urls
    .map((url) => {
      const loc = `${SITE_URL}${url.loc}`;
      const lastmod = url.lastmod ? `  <lastmod>${url.lastmod}</lastmod>` : '';
      const changefreq = url.changefreq ? `  <changefreq>${url.changefreq}</changefreq>` : '';
      const priority = url.priority !== undefined ? `  <priority>${url.priority}</priority>` : '';

      return `
 <url>
  <loc>${loc}</loc>${lastmod}${changefreq}${priority}
 </url>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlElements}
</urlset>`;
}

/**
 * Main: Generate sitemap and write to public/sitemap.xml
 */
function main() {
  const sitemap = generateSitemap(routes);
  const publicDir = path.resolve(__dirname, '../public');
  const sitemapPath = path.join(publicDir, 'sitemap.xml');

  // Ensure public directory exists
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  fs.writeFileSync(sitemapPath, sitemap, 'utf-8');

  console.log(`✅ Sitemap generated: ${sitemapPath}`);
  console.log(`   ${routes.length} URLs included`);
}

main();
