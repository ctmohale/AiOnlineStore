import { describe, expect, it } from 'vitest';
import { adminProductCreateSchema } from './validation';

describe('product sourcing validation', () => {
  it('preserves an unprovided promotion end as null', () => {
    const result = adminProductCreateSchema.parse({
      title: 'Test product', category: 'Test', sellingPrice: 499,
      supplier: { promotionStartAt: null, promotionEndAt: null, lastCheckedAt: null, priceUpdatedAt: null },
    });

    expect(result.supplier?.promotionStartAt).toBeNull();
    expect(result.supplier?.promotionEndAt).toBeNull();
    expect(result.supplier?.lastCheckedAt).toBeNull();
    expect(result.supplier?.priceUpdatedAt).toBeNull();
  });
});
