import { describe, expect, it } from 'vitest';
import { publicProductSlugBase, sanitizePublicProductName, sanitizePublicProductSpecs, sanitizePublicProductText } from './public-product.js';

describe('customer-facing product copy', () => {
  it('removes long supplier identifiers and import boilerplate', () => {
    expect(sanitizePublicProductText('Toshiba TV. Current public Game listing, exact item code 000000000850004455.')).toBe('Toshiba TV.');
    expect(sanitizePublicProductText('Product ID: 000000000850004455')).toBe('');
  });

  it('keeps real model names and ordinary product measurements', () => {
    expect(sanitizePublicProductText('TOSHIBA 55C350MN · 55 inch')).toBe('TOSHIBA 55C350MN · 55 inch');
    expect(sanitizePublicProductName('Television 000000000850004455')).toBe('Television');
    expect(publicProductSlugBase('Toshiba TV 000000000850004455')).toBe('toshiba-tv');
  });

  it('removes identifier specifications while retaining useful details', () => {
    expect(sanitizePublicProductSpecs({ SKU: '000000000850004455', Barcode: '6001234567890', Size: '55 inch', Model: '55C350MN' })).toEqual({ Size: '55 inch', Model: '55C350MN' });
  });
});
