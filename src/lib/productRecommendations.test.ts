import { describe, expect, it } from 'vitest';
import type { Product } from '../data/products';
import { relatedProductsFor } from './productRecommendations';

const product = (overrides: Partial<Product>): Product => ({
  id: 1, slug: 'hp-laptop', name: 'HP Laptop', brand: 'HP', model: '255 G10', packSize: '1 unit', category: 'Laptops',
  price: 5250, image: '', images: [], accent: '#fff', short: '', description: '', specs: {}, status: 'published',
  ...overrides,
});

describe('related product recommendations', () => {
  it('prioritises category and brand matches, ranks popularity, and excludes the current product', () => {
    const current = product({ id: 1 });
    const sameCategoryAndBrand = product({ id: 2, slug: 'hp-elitebook', name: 'HP EliteBook', trendingUnits: 2 });
    const popularSameCategory = product({ id: 3, slug: 'lenovo-laptop', name: 'Lenovo Laptop', brand: 'Lenovo', unitsSold: 20 });
    const sameBrandOtherCategory = product({ id: 4, slug: 'hp-printer', name: 'HP Printer', category: 'Printers' });
    const unrelated = product({ id: 5, slug: 'air-fryer', name: 'Air Fryer', brand: 'Defy', category: 'Kitchen Appliances' });

    expect(relatedProductsFor(current, [current, popularSameCategory, unrelated, sameBrandOtherCategory, sameCategoryAndBrand])).toEqual([
      sameCategoryAndBrand,
      popularSameCategory,
      sameBrandOtherCategory,
    ]);
  });

  it('honours the requested display limit', () => {
    const current = product({ id: 1 });
    const candidates = [2, 3, 4, 5].map((id) => product({ id, slug: `laptop-${id}`, name: `Laptop ${id}` }));
    expect(relatedProductsFor(current, [current, ...candidates], 2)).toHaveLength(2);
  });
});
