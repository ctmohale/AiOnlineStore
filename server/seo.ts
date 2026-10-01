export type SeoProduct = {
  id: number; slug: string; title: string; brand?: string; model?: string; category?: string; description?: string;
  selling_price: number; original_displayed_price?: number | null; image_url?: string | null;
  images?: { url: string; alt_text?: string }[];
};

export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character);
export const absoluteUrl = (base: string, path: string) => new URL(path, `${base.replace(/\/$/, '')}/`).toString();

const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
export function productMeta(product: SeoProduct, storeUrl: string) {
  const canonical = absoluteUrl(storeUrl, `/product/${encodeURIComponent(product.slug)}`);
  const image = product.images?.[0]?.url || product.image_url || absoluteUrl(storeUrl, '/icon-512.png');
  const description = String(product.description || `Shop ${product.title} from Moya Market. Stock and supplier price are checked before payment.`).replace(/\s+/g, ' ').trim().slice(0, 220);
  const title = `${product.title} | Moya Market`;
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Product', name: product.title, description, image: (product.images?.map((item) => item.url).filter(Boolean) || [image]), sku: product.model || String(product.id), brand: { '@type': 'Brand', name: product.brand || 'Unbranded' }, category: product.category, url: canonical, offers: { '@type': 'Offer', priceCurrency: 'ZAR', price: Number(product.selling_price).toFixed(2), availability: 'https://schema.org/InStock', url: canonical, seller: { '@type': 'Organization', name: 'Moya Market' } } };
  return `<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(canonical)}" />
<meta property="og:type" content="product" /><meta property="og:site_name" content="Moya Market" />
<meta property="og:title" content="${escapeHtml(title)}" /><meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(canonical)}" /><meta property="og:image" content="${escapeHtml(image)}" /><meta property="og:image:alt" content="${escapeHtml(product.title)}" />
<meta property="product:price:amount" content="${Number(product.selling_price).toFixed(2)}" /><meta property="product:price:currency" content="ZAR" />
<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${escapeHtml(title)}" /><meta name="twitter:description" content="${escapeHtml(description)}" /><meta name="twitter:image" content="${escapeHtml(image)}" />
<script type="application/ld+json">${safeJson(jsonLd)}</script>`;
}

export function catalogueMeta(products: SeoProduct[], title: string, storeUrl: string, requestPath: string) {
  const cleanTitle = title.trim().slice(0, 90) || 'Selected deals from Moya Market';
  const canonical = absoluteUrl(storeUrl, requestPath);
  const image = products[0]?.images?.[0]?.url || products[0]?.image_url || absoluteUrl(storeUrl, '/icon-512.png');
  const description = products.length ? `${products.length} selected products: ${products.slice(0, 4).map((item) => item.title).join(', ')}. Stock and price checked before payment.` : 'Browse selected products from Moya Market.';
  const list = { '@context': 'https://schema.org', '@type': 'ItemList', name: cleanTitle, url: canonical, numberOfItems: products.length, itemListElement: products.map((product, index) => ({ '@type': 'ListItem', position: index + 1, url: absoluteUrl(storeUrl, `/product/${encodeURIComponent(product.slug)}`), name: product.title })) };
  return `<title>${escapeHtml(cleanTitle)} | Moya Market</title><meta name="description" content="${escapeHtml(description)}" /><link rel="canonical" href="${escapeHtml(canonical)}" />
<meta property="og:type" content="website" /><meta property="og:site_name" content="Moya Market" /><meta property="og:title" content="${escapeHtml(cleanTitle)}" /><meta property="og:description" content="${escapeHtml(description)}" /><meta property="og:url" content="${escapeHtml(canonical)}" /><meta property="og:image" content="${escapeHtml(image)}" />
<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${escapeHtml(cleanTitle)}" /><meta name="twitter:description" content="${escapeHtml(description)}" /><meta name="twitter:image" content="${escapeHtml(image)}" /><script type="application/ld+json">${safeJson(list)}</script>`;
}

export const injectHead = (html: string, metadata: string) => html
  .replace(/<title>[\s\S]*?<\/title>/i, '')
  .replace(/\s*<meta\s+(?:name|property)="(?:description|og:[^"]+|twitter:[^"]+)"[^>]*>/gi, '')
  .replace(/\s*<link\s+rel="canonical"[^>]*>/gi, '')
  .replace('</head>', `${metadata}</head>`);
