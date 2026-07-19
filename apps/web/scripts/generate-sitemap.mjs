#!/usr/bin/env node
/**
 * Generate sitemap.xml for SEO.
 *
 * Plain ESM so it runs on `node` with zero extra tooling (no ts-node/tsx) — the
 * build runs this as a prestep, and a missing TS runtime must never break a
 * production build. Run: `node scripts/generate-sitemap.mjs`.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Env-driven so a preview deploy emits its own canonical host. Falls
// back to the production marketing domain.
const SITE_URL = (process.env.VITE_MARKETING_URL ?? 'https://flowerp.uz').replace(/\/$/, '');

/**
 * Public routes with SEO metadata. Authenticated routes (/app/*, /portal/*,
 * /auth/*) are intentionally excluded — they're disallowed in robots.txt.
 */
const routes = [
  {
    loc: '/',
    lastmod: new Date().toISOString().split('T')[0],
    changefreq: 'weekly',
    priority: 1.0,
  },
  { loc: '/privacy', changefreq: 'yearly', priority: 0.3 },
  { loc: '/terms', changefreq: 'yearly', priority: 0.3 },
  // Future routes (add as they're implemented):
  // { loc: '/pricing', changefreq: 'monthly', priority: 0.9 },
  // { loc: '/features', changefreq: 'monthly', priority: 0.8 },
];

function generateSitemap(urls) {
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

function main() {
  const sitemap = generateSitemap(routes);
  const publicDir = path.resolve(__dirname, '../public');
  const sitemapPath = path.join(publicDir, 'sitemap.xml');

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  fs.writeFileSync(sitemapPath, sitemap, 'utf-8');

  console.log(`Sitemap generated: ${sitemapPath}`);
  console.log(`  ${routes.length} URLs included (host: ${SITE_URL})`);
}

main();
