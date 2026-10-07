import fs from 'node:fs/promises';
import path from 'node:path';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { catalogueMeta, escapeHtml, injectHead, productMeta, type SeoProduct } from './seo.js';

type FrontendOptions = {
  apiBase?: string;
};

export function installFrontend(app: Express, options: FrontendOptions = {}) {
  const dist = path.join(process.cwd(), 'dist');
  const storeUrl = (process.env.PUBLIC_STORE_URL || process.env.FRONTEND_URL?.split(',')[0] || 'https://mzansimegastore.co.za').replace(/\/$/, '');
  const apiBase = (options.apiBase || process.env.PUBLIC_API_URL || process.env.VITE_API_URL || 'https://api-production-093e2.up.railway.app/api').replace(/\/$/, '');
  const template = () => fs.readFile(path.join(dist, 'index.html'), 'utf8');

  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], connectSrc: ["'self'", 'https:'], imgSrc: ["'self'", 'data:', 'https:'], styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'", "'unsafe-inline'"] } } }));
  app.get('/robots.txt', (_request, response) => response.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account\nDisallow: /cart\nDisallow: /request\nDisallow: /confirmation\nSitemap: ${storeUrl}/sitemap.xml\n`));
  app.get('/sitemap.xml', async (_request, response, next) => {
    try {
      const products = await fetch(`${apiBase}/seo/sitemap`).then((result) => result.ok ? result.json() as Promise<{ slug: string; updated_at?: string }[]> : Promise.reject(new Error(`Catalogue returned ${result.status}`)));
      const staticUrls = ['', '/shop', '/about', '/contact', '/delivery-policy', '/returns-refunds', '/privacy', '/terms', '/payment-security', '/complaints'].map((route) => `<url><loc>${escapeHtml(`${storeUrl}${route || '/'}`)}</loc><changefreq>${route === '/shop' ? 'daily' : 'monthly'}</changefreq><priority>${route ? '0.8' : '1.0'}</priority></url>`);
      const productUrls = products.map((product) => `<url><loc>${escapeHtml(`${storeUrl}/product/${encodeURIComponent(product.slug)}`)}</loc>${product.updated_at ? `<lastmod>${new Date(product.updated_at).toISOString()}</lastmod>` : ''}<changefreq>daily</changefreq><priority>0.8</priority></url>`);
      response.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...staticUrls, ...productUrls].join('')}</urlset>`);
    } catch (error) { next(error); }
  });
  app.get('/product/:slug', async (request, response) => {
    try {
      const result = await fetch(`${apiBase}/products/${encodeURIComponent(request.params.slug)}`);
      const html = await template();
      if (!result.ok) return response.status(result.status === 404 ? 404 : 200).set('X-Robots-Tag', result.status === 404 ? 'noindex' : 'index, follow').send(html);
      const product = await result.json() as SeoProduct;
      if (product.slug !== request.params.slug) return response.redirect(301, `/product/${encodeURIComponent(product.slug)}`);
      response.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600').send(injectHead(html, productMeta(product, storeUrl)));
    } catch { response.sendFile(path.join(dist, 'index.html')); }
  });
  app.get('/catalog', async (request, response) => {
    try {
      const ids = String(request.query.ids || '').split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 24);
      const selected = await fetch(`${apiBase}/products${ids.length ? `?ids=${ids.join(',')}` : ''}`).then((result) => result.ok ? result.json() as Promise<SeoProduct[]> : []);
      const html = await template();
      response.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600').send(injectHead(html, catalogueMeta(selected.slice(0, ids.length || 12), String(request.query.title || ''), storeUrl, request.originalUrl)));
    } catch { response.sendFile(path.join(dist, 'index.html')); }
  });
  app.use(express.static(dist, { maxAge: '1h', etag: true }));
  app.use((request, response) => {
    if (/^\/(admin|account|cart|request|confirmation)/.test(request.path)) response.set('X-Robots-Tag', 'noindex, nofollow');
    response.sendFile(path.join(dist, 'index.html'));
  });
}
