import { describe, expect, it } from 'vitest';
import { adminCustomerUpdateSchema, customerPasswordUpdateSchema, orderStatusSchema, supplierItemVerificationSchema, supportCaseCreateSchema, supportCaseUpdateSchema } from './validation';

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
    expect(adminCustomerUpdateSchema.parse({ name: 'Example Customer', email: 'customer@example.com', phone: '', newPassword: '' }).phone).toBeNull();
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

describe('supplier item verification', () => {
  it('requires a confirmed price for an available item', () => {
    expect(supplierItemVerificationSchema.safeParse({ status: 'verified', verifiedSupplierUnitCost: null }).success).toBe(false);
    expect(supplierItemVerificationSchema.safeParse({ status: 'verified', verifiedSupplierUnitCost: 549.99 }).success).toBe(true);
  });

  it('allows an unavailable result without inventing a price', () => {
    expect(supplierItemVerificationSchema.safeParse({ status: 'unavailable', verifiedSupplierUnitCost: null, notes: 'No stock' }).success).toBe(true);
  });
});

describe('cancellation and return case validation', () => {
  it('requires a meaningful reason when opening a case', () => {
    expect(supportCaseCreateSchema.safeParse({ caseType: 'cancellation', reasonCategory: 'changed_mind', reasonDetails: '' }).success).toBe(false);
    expect(supportCaseCreateSchema.safeParse({ caseType: 'return', reasonCategory: 'defective', reasonDetails: 'Unit does not power on', evidenceUrls: ['https://example.test/photo.jpg'] }).success).toBe(true);
  });

  it('requires the amount before resolving a refund', () => {
    const base = { status: 'resolved', resolution: 'refund' };
    expect(supportCaseUpdateSchema.safeParse({ ...base, refundAmount: null }).success).toBe(false);
    expect(supportCaseUpdateSchema.safeParse({ ...base, refundAmount: 499 }).success).toBe(true);
  });
});
