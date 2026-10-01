import { describe, expect, it } from 'vitest';
import { catalogueMeta, injectHead, productMeta } from './seo';

const product = { id: 7, slug: 'test-kettle', title: 'Test & Kettle', brand: 'Acme', model: 'KT-1', category: 'Appliances', description: 'Fast, safe kettle.', selling_price: 499, images: [{ url: 'https://cdn.example.test/front.jpg', alt_text: 'Front' }, { url: 'https://cdn.example.test/side.jpg', alt_text: 'Side' }] };

describe('SEO metadata', () => {
  it('builds escaped product social metadata and Product JSON-LD', () => {
    const meta = productMeta(product, 'https://shop.example.test');
    expect(meta).toContain('Test &amp; Kettle');
    expect(meta).toContain('property="og:image" content="https://cdn.example.test/front.jpg"');
    expect(meta).toContain('name="twitter:card" content="summary_large_image"');
    expect(meta).toContain('"@type":"Product"');
    expect(meta).toContain('"priceCurrency":"ZAR"');
  });

  it('replaces generic metadata rather than creating conflicting tags', () => {
    const html = '<head><title>Old</title><meta name="description" content="old"><meta property="og:title" content="old"><link rel="canonical" href="old"></head>';
    const output = injectHead(html, productMeta(product, 'https://shop.example.test'));
    expect(output.match(/property="og:title"/g)).toHaveLength(1);
    expect(output).not.toContain('content="old"');
  });

  it('builds shareable ItemList metadata', () => {
    expect(catalogueMeta([product], 'Weekend deals', 'https://shop.example.test', '/catalog?ids=7')).toContain('"@type":"ItemList"');
  });
});
