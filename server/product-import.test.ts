import { afterEach, describe, expect, it, vi } from 'vitest';
import { highResolutionImageUrl, importProductUrl, isSupportedProductUrl } from './product-import';

afterEach(() => vi.unstubAllGlobals());

describe('product URL import', () => {
  it('recognises only supported HTTPS product hosts', () => {
    expect(isSupportedProductUrl('https://www.game.co.za/products/test-kettle')).toBe(true);
    expect(isSupportedProductUrl('http://www.game.co.za/products/test-kettle')).toBe(false);
    expect(isSupportedProductUrl('https://game.co.za.example.com/products/test-kettle')).toBe(false);
    expect(isSupportedProductUrl('not a URL')).toBe(false);
  });

  it('requests the high-resolution Makro product image variant', () => {
    expect(highResolutionImageUrl('https://www.makro.co.za/asset/rukmini/fccp/416/416/example/photo.jpeg?q=70')).toBe('https://www.makro.co.za/asset/rukmini/fccp/1200/1200/example/photo.jpeg?q=95');
  });

  it('extracts a review draft from public retailer structured data', async () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      '@type': 'Product', name: 'Test Kettle', brand: { name: 'Acme' }, model: 'KT-100', sku: 'GAME-44', gtin13: '6001234567890',
      description: 'A useful test kettle.', image: 'https://cdn.example.test/kettle.jpg', category: 'Appliances',
      offers: { '@type': 'Offer', price: '499.99', availability: 'https://schema.org/InStock' },
    })}</script></head></html>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })));

    const result = await importProductUrl('https://www.game.co.za/products/test-kettle');

    expect(result).toMatchObject({ title: 'Test Kettle', brand: 'Acme', model: 'KT-100', supplierSku: 'GAME-44', currentCost: 499.99, stockStatus: 'in_stock', retailer: 'Game', supplierPriceVerified: false });
  });

  it('blocks non-allowlisted URLs before making a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(importProductUrl('https://example.com/product')).rejects.toThrow('Only public Game or Makro');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
