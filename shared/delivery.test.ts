import { describe, expect, it } from 'vitest';
import { addBusinessDays, deliveryEstimate, inferFulfilmentType } from './delivery.js';

describe('supplier-aware delivery estimates', () => {
  it('detects online-only and store-stock signals', () => {
    expect(inferFulfilmentType('Available online only')).toBe('online_only');
    expect(inferFulfilmentType('Click & collect from store')).toBe('store_stock');
  });
  it('makes store stock faster than online-only supply', () => {
    const store = deliveryEstimate({ retailer: 'Game', fulfilmentType: 'store_stock', province: 'Gauteng' });
    const online = deliveryEstimate({ retailer: 'Game', fulfilmentType: 'online_only', province: 'Gauteng' });
    expect(store.totalMaxDays).toBeLessThan(online.totalMaxDays);
  });
  it('uses business days for the promised date', () => {
    expect(addBusinessDays(new Date('2026-10-02T12:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-10-05');
  });
});
