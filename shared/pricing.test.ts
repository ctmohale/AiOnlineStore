import { describe, expect, it } from 'vitest';
import { recommendedSellingPrice } from './domain';

describe('source pricing', () => {
  const now = new Date('2026-10-01T08:00:00Z');

  it('adds 15% to an active promotion while staying below the normal source price', () => {
    expect(recommendedSellingPrice({ cost: 800, originalPrice: 1200, promotionEndAt: '2026-10-02T00:00:00Z' }, 7, now)).toEqual({ sellingPrice: 920, promotionActive: true });
    expect(recommendedSellingPrice({ cost: 800, originalPrice: 850 }, 7, now)).toEqual({ sellingPrice: 849.99, promotionActive: true });
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
