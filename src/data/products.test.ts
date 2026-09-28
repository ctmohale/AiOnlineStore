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
});
