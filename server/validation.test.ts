import { describe, expect, it } from 'vitest';
import { adminCustomerUpdateSchema, customerPasswordUpdateSchema, orderStatusSchema } from './validation';

describe('shipment tracking', () => {
  it('requires a courier and number, and rejects unsafe tracking links', () => {
    expect(orderStatusSchema.safeParse({ status: 'shipped' }).success).toBe(false);
    expect(orderStatusSchema.safeParse({ status: 'shipped', courierName: 'Bob Go', trackingNumber: 'ABC123', trackingUrl: 'http://example.test/track' }).success).toBe(false);
    expect(orderStatusSchema.safeParse({ status: 'shipped', courierName: 'Bob Go', trackingNumber: 'ABC123', trackingUrl: 'https://example.test/track' }).success).toBe(true);
  });
});
import { adminProductCreateSchema } from './validation';

describe('customer account validation', () => {
  it('requires a strong new password different from the current password', () => {
    expect(customerPasswordUpdateSchema.safeParse({ currentPassword: 'old-password', newPassword: 'old-password' }).success).toBe(false);
    expect(customerPasswordUpdateSchema.safeParse({ currentPassword: 'old-password', newPassword: 'new-secure-password' }).success).toBe(true);
  });

  it('accepts an admin profile update without forcing a password reset', () => {
    expect(adminCustomerUpdateSchema.parse({ name: 'Moya Customer', email: 'customer@example.com', phone: '', newPassword: '' }).phone).toBeNull();
  });
});

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
