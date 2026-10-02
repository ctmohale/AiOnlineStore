import { describe, expect, it } from 'vitest';
import type { Product } from '../data/products';
import { categoryGroupFor, categorySummaries, matchesCategory } from './categories';

describe('separate catalogue categories', () => {
  it('keeps individual supplier categories instead of broad department groups', () => {
    expect(categoryGroupFor('Digital Cameras')).toBe('Digital Cameras');
    expect(categoryGroupFor('Computer Accessories')).toBe('Computer Accessories');
    expect(categoryGroupFor('Car Accessories')).toBe('Car Accessories');
    expect(categoryGroupFor('Personal-Care')).toBe('Personal Care');
    expect(categoryGroupFor('Kitchen-Large-Appliances')).toBe('Kitchen Large Appliances');
  });
  it('gives all baby categories a single dedicated Baby category', () => {
    for (const category of ['Baby-Travel', 'Baby nappies', 'Nursery Furniture & Decor', 'Toddlers Toys', 'Bath Time']) {
      expect(categoryGroupFor(category)).toBe('Baby');
    }
    expect(categoryGroupFor('General', 'Huggies Extra Care Nappies Size 2 Tape Diapers')).toBe('Baby');
    expect(categoryGroupFor('Healthcare-Vitamins')).toBe('Healthcare Vitamins');
  });
  it('supports exact existing category links and normalized labels', () => {
    expect(matchesCategory('Personal-Care', 'Personal Care')).toBe(true);
    expect(matchesCategory('Baby-Travel', 'Baby')).toBe(true);
    expect(matchesCategory('Baby-Travel', 'Baby-Travel')).toBe(true);
    expect(matchesCategory('Digital Cameras', 'Computer Accessories')).toBe(false);
  });
  it('counts each product once and combines only equivalent labels and baby categories', () => {
    const products = ['Personal-Care', 'Personal Care', 'Baby nappies', 'Baby-Travel', 'Digital Cameras', 'Computer Accessories']
      .map((category, id) => ({ id, category, name: '', brand: '', model: '' } as Product));
    expect(categorySummaries(products)).toEqual([
      { name: 'Baby', count: 2 }, { name: 'Computer Accessories', count: 1 },
      { name: 'Digital Cameras', count: 1 }, { name: 'Personal Care', count: 2 },
    ]);
  });
});
