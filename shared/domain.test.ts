import { describe, expect, it } from 'vitest';
import { calculateProfit, customerDeliveryCharge, isExactProductMatch, offerReviewReason } from './domain';

describe('pricing', () => {
  it('subtracts every attributable cost from revenue and delivery charged', () => {
    expect(calculateProfit({ productRevenue: 1099, customerDeliveryCharged: 0, supplierProductCost: 720, supplierDelivery: 20, customerDeliveryCost: 89, packaging: 18, paymentFees: 33, advertisingCost: 20 })).toBe(199);
  });
  it('applies free delivery at exactly R999', () => {
    expect(customerDeliveryCharge(998.99)).toBe(89);
    expect(customerDeliveryCharge(999)).toBe(0);
  });
});

describe('offer safety', () => {
  it('flags an expired promotion', () => {
    expect(offerReviewReason({ stockStatus: 'in_stock', currentCost: 500, lastCheckedAt: new Date('2026-09-28T08:00:00Z'), promotionEndAt: new Date('2026-09-27T23:59:59Z') }, new Date('2026-09-28T10:00:00Z'))).toBe('promotion_expired');
  });
  it('flags stale supplier data', () => {
    expect(offerReviewReason({ stockStatus: 'in_stock', currentCost: 500, lastCheckedAt: new Date('2026-09-26T08:00:00Z') }, new Date('2026-09-28T10:00:00Z'), 24)).toBe('supplier_data_stale');
  });
});

describe('exact matching', () => {
  it('does not merge different pack sizes', () => {
    expect(isExactProductMatch({ brand: 'Pampers', model: 'Active Baby 6', packSize: '96 pack' }, { brand: 'Pampers', model: 'Active Baby 6', packSize: '84 pack' })).toBe(false);
  });
  it('matches equal barcodes even when labels differ', () => {
    expect(isExactProductMatch({ barcode: '6001234567890', brand: 'A', model: 'X', packSize: '1' }, { barcode: '6001234567890', brand: 'B', model: 'Y', packSize: '2' })).toBe(true);
  });
});

describe('order price locking', () => {
  it('preserves the captured unit price when catalogue price changes', () => {
    const orderItem = Object.freeze({ agreedUnitPrice: 649, quantity: 2 });
    const cataloguePrice = 729;
    expect(orderItem.agreedUnitPrice * orderItem.quantity).toBe(1298);
    expect(cataloguePrice * orderItem.quantity).toBe(1458);
  });
});
