import { describe, expect, it } from 'vitest';
import { mapPublicProduct } from './products';

describe('live catalogue product mapping', () => {
  it('maps database API fields without inserting placeholder product data', () => {
    const product = mapPublicProduct({
      id: 42, slug: 'real-kettle-42', title: 'Real Kettle', brand: 'Acme', model: 'RK-1', pack_size: '1 unit', category: 'Appliances',
      description: 'A real database product.', specifications: '{"Capacity":"1.7L"}', selling_price: 599,
      original_displayed_price: 699, image_url: null,
    });

    expect(product).toMatchObject({ id: 42, slug: 'real-kettle-42', name: 'Real Kettle', price: 599, compareAt: 699, specs: { Capacity: '1.7L' }, status: 'published' });
    expect(product.image).toBe('');
  });

  it('keeps supplier identifiers out of customer-facing product fields', () => {
    const product = mapPublicProduct({
      id: 43, slug: 'toshiba-tv-000000000850004455-feae18', title: 'Toshiba TV 000000000850004455', brand: 'Toshiba', model: '000000000850004455', pack_size: '1 unit', category: 'Televisions',
      description: 'Toshiba TV. Current public Game listing, exact item code 000000000850004455.', specifications: { SKU: '000000000850004455', Barcode: '6001234567890', Size: '55 inch' }, selling_price: 7349, image_url: null,
    });

    expect(product.name).toBe('Toshiba TV');
    expect(product.model).toBe('');
    expect(product.description).toBe('Toshiba TV.');
    expect(product.specs).toEqual({ Size: '55 inch' });
  });
});
