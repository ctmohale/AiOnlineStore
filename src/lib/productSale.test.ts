import { describe, expect, it } from 'vitest';
import type { Product } from '../data/products';
import { money } from '../data/products';
import { productSale } from './productSale';
const now = Date.parse('2026-10-02T18:00:00Z');
const sale = { price: 435.85, compareAt: 799 } as Product;
describe('product sale display', () => {
  it('calculates the genuine saving without overstating the discount', () => {
    expect(productSale(sale, now)?.discountLabel).toBe(money(363));
    expect(productSale({ ...sale, price: 400, compareAt: 800 }, now)?.discountLabel).toBe(money(400));
  });
  it('suppresses tiny reductions and identical displayed prices', () => {
    expect(productSale({ ...sale, price: 8998.85, compareAt: 8999 }, now)).toBeNull();
    expect(productSale({ ...sale, price: 3449, compareAt: 3499 }, now)).toBeNull();
    expect(productSale({ ...sale, price: 980, compareAt: 1000 }, now)?.badgeLabel).toBe(`Save ${money(20)}`);
  });
  it('shows the supplied end date in South African time and handles a missing date', () => {
    expect(productSale({ ...sale, promotionEndAt: '2026-10-03T20:00:00Z' }, now)?.endLabel).toContain('22:00 SAST');
    expect(productSale(sale, now)?.endLabel).toBeNull();
  });
  it('does not label full-price, future or expired promotions as sales', () => {
    expect(productSale({ ...sale, compareAt: 435.85 }, now)).toBeNull();
    expect(productSale({ ...sale, compareAt: undefined }, now)).toBeNull();
    expect(productSale({ ...sale, promotionEndAt: '2026-10-01T18:00:00Z' }, now)).toBeNull();
    expect(productSale({ ...sale, promotionStartAt: '2026-10-03T18:00:00Z' }, now)).toBeNull();
  });
});


it('shows rand savings for every qualifying sale, including reductions below 10%', () => {
  expect(productSale({ ...sale, price: 901, compareAt: 1000 }, now)?.badgeLabel).toBe(`Save ${money(99)}`);
  expect(productSale({ ...sale, price: 900, compareAt: 1000 }, now)?.badgeLabel).toBe(`Save ${money(100)}`);
});
