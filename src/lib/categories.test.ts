import { describe, expect, it } from 'vitest';
import { CATEGORY_NAMES, categoryGroupFor, matchesCategory, categorySummaries } from './categories';

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

  it('uses product details to classify vague supplier categories', () => {
    expect(categoryGroupFor('refurbished', 'Dell Latitude notebook')).toBe('Electronics & Computing');
    expect(categoryGroupFor('pre-owned', 'Apple iPhone 12')).toBe('Electronics & Computing');
    expect(categoryGroupFor('CSD Pet', 'Coca-Cola Original Taste Soft Drink')).toBe('Food & Household');
    expect(categoryGroupFor('General', 'Standing water dispenser')).toBe('Home Appliances');
    expect(categoryGroupFor('Binoculars & Telescopes', 'Celestron spotting scope')).toBe('Outdoor & Sports');
  });

  it('does not expose a vague catch-all department', () => {
    expect(CATEGORY_NAMES).not.toContain('More Categories');
  });
});

describe('focused shopping categories', () => {
  it('finds specific products while preserving broad departments', () => {
    expect(matchesCategory('General', 'Phones & Tablets', 'Apple iPhone 12')).toBe(true);
    expect(matchesCategory('Kitchen Accessories', 'Kitchen & Dining', 'Non-stick frying pan')).toBe(true);
    expect(matchesCategory('Baby Travel', 'Baby & Nursery', 'Compact stroller')).toBe(true);
    expect(matchesCategory('Renewable Energy', 'Solar & Backup Power', 'Portable power station')).toBe(true);
    expect(matchesCategory('Kitchen Accessories', 'Home & Furniture', 'Non-stick frying pan')).toBe(true);
  });
  it('avoids short-word matches inside unrelated names', () => {
    expect(matchesCategory('Furniture', 'Baby & Nursery', 'Cotton cushion')).toBe(false);
    expect(matchesCategory('Office', 'Solar & Backup Power', 'Cups and saucers')).toBe(false);
    expect(matchesCategory('General', 'Phones & Tablets', 'Headphones')).toBe(false);
  });
});


it('keeps every category visible and counts matching products consistently', () => {
  const products = [{ category: 'General', name: 'Apple iPhone 12', brand: 'Apple', model: '12' }, { category: 'Baby Travel', name: 'Compact stroller', brand: '', model: '' }] as import('../data/products').Product[];
  const summaries = categorySummaries(products);
  expect(summaries.find(({ name }) => name === 'Phones & Tablets')?.count).toBe(1);
  expect(summaries.find(({ name }) => name === 'Baby & Nursery')?.count).toBe(1);
  expect(summaries.find(({ name }) => name === 'Solar & Backup Power')?.count).toBe(0);
  expect(categorySummaries([])).toHaveLength(12);
  for (const summary of summaries) expect(products.filter((product) => matchesCategory(product.category, summary.name, `${product.name} ${product.brand} ${product.model}`))).toHaveLength(summary.count);
});
