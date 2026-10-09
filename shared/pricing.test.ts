import { describe, expect, it } from 'vitest';
import { profitProtectedSellingPrice, recommendedSellingPrice } from './domain';

describe('source pricing', () => {
  const now = new Date('2026-10-01T08:00:00Z');

  it('keeps half of an active supplier discount as product profit', () => {
    expect(recommendedSellingPrice({ cost: 800, originalPrice: 1200, promotionEndAt: '2026-10-02T00:00:00Z' }, 7, now)).toEqual({ sellingPrice: 1000, promotionActive: true });
    expect(recommendedSellingPrice({ cost: 800, originalPrice: 850 }, 7, now)).toEqual({ sellingPrice: 825, promotionActive: true });
  });

  it('reverts to regular markup after the promotion and supports the configured 5–10% range', () => {
    const source = { cost: 800, originalPrice: 1200, promotionEndAt: '2026-09-30T23:59:59Z' };
    expect(recommendedSellingPrice(source, 7, now)).toEqual({ sellingPrice: 856, promotionActive: false });
    expect(recommendedSellingPrice(source, 5, now).sellingPrice).toBe(840);
    expect(recommendedSellingPrice(source, 10, now).sellingPrice).toBe(880);
  });

  it('rejects an invalid markup or missing source cost', () => {
    expect(() => recommendedSellingPrice({ cost: 0 })).toThrow('positive supplier price');
    expect(() => recommendedSellingPrice({ cost: 100 }, 11)).toThrow('between 5% and 10%');
  });
});

describe('profit-protected product pricing', () => {
  const now = new Date('2026-10-01T08:00:00Z');

  it('enforces product profit and margin without using delivery charges or costs', () => {
    expect(profitProtectedSellingPrice({ cost: 100 }, 5, 10, 5, now).sellingPrice).toBe(110);
    expect(profitProtectedSellingPrice({ cost: 1000 }, 5, 10, 6, now).sellingPrice).toBe(1063.83);
  });

  it('uses half of a supplier sale discount while retaining the absolute profit floor', () => {
    expect(profitProtectedSellingPrice({ cost: 800, originalPrice: 1000 }, 7, 20, 5, now)).toEqual({ sellingPrice: 900, promotionActive: true, salePricingApplied: true });
    expect(profitProtectedSellingPrice({ cost: 800, originalPrice: 810 }, 7, 20, 5, now)).toEqual({ sellingPrice: 820, promotionActive: false, salePricingApplied: true });
  });

  it('rejects invalid product profit guardrails', () => {
    expect(() => profitProtectedSellingPrice({ cost: 100 }, 7, -1, 4, now)).toThrow('Minimum profit');
    expect(() => profitProtectedSellingPrice({ cost: 100 }, 7, 10, 100, now)).toThrow('Minimum margin');
  });
});
