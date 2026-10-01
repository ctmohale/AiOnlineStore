import { describe, expect, it } from 'vitest';
import { categoryGroupFor, matchesCategory } from './categories';

describe('catalogue category groups', () => {
  it('normalises supplier separators into customer-friendly groups', () => {
    expect(categoryGroupFor('Kitchen-Large-Appliances')).toBe('Home Appliances');
    expect(categoryGroupFor('Laptops-Tablets-Computers')).toBe('Electronics & Computing');
    expect(categoryGroupFor('Baby-Travel')).toBe('Health, Beauty & Baby');
  });

  it('supports grouped navigation and legacy exact category links', () => {
    expect(matchesCategory('Digital Cameras', 'Electronics & Computing')).toBe(true);
    expect(matchesCategory('Digital Cameras', 'Digital Cameras')).toBe(true);
    expect(matchesCategory('Digital Cameras', 'Home Appliances')).toBe(false);
  });
});
