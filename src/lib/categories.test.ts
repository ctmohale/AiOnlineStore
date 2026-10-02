import { describe, expect, it } from 'vitest';
import { CATEGORY_NAMES, categoryGroupFor, matchesCategory } from './categories';

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
