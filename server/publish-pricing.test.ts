import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';

const db = vi.hoisted(() => ({ sellingPrice: 0, updates: 0, currentCost: 800, originalPrice: 850 as number | null, freeDeliveryThreshold: 500 }));
vi.mock('./db/pool.js', () => ({
  pool: { execute: vi.fn() },
  withTransaction: async (callback: (connection: { execute: (sql: string, params: unknown[]) => Promise<unknown[]> }) => Promise<unknown>) => callback({
    execute: async (sql: string, params: unknown[]) => {
      if (sql.startsWith('SELECT p.selling_price,p.status')) return [[{ selling_price: db.sellingPrice, status: 'pending_review', offer_id: 1, current_cost: db.currentCost }]];
      if (sql.startsWith('INSERT INTO price_history')) return [{ affectedRows: 1 }];
      if (sql.startsWith('UPDATE products SET selling_price=')) { db.sellingPrice = Number(params[0]); db.updates++; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('SELECT p.title,p.category')) return [[{
        title: 'Test blender', category: 'Appliances', model: 'ABC', pack_size: '1', image_url: 'https://www.makro.co.za/image.jpg', image_count: 3, selling_price: db.sellingPrice,
        offer_id: 1, source_url: 'https://www.makro.co.za/product', current_cost: db.currentCost, original_displayed_price: db.originalPrice,
        stock_status: 'in_stock', last_checked_at: new Date(), promotion_end_at: null, price_verified: true,
        supplier_delivery_cost: 0, estimated_customer_delivery_cost: 0, minimum_profit: null,
        global_minimum_profit: 0, minimum_margin_percent: 0, standard_markup_percent: 7, free_delivery_threshold: db.freeDeliveryThreshold, standard_customer_delivery: 89, supplier_stale_hours: 24,
      }]];
      if (sql.startsWith('UPDATE products SET status=')) return [{ affectedRows: 1 }];
      if (sql.startsWith('INSERT INTO product_reviews')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query: ${sql}`);
    },
  }),
}));

import app from './app.js';
import { signAdminToken } from './auth.js';

describe('publish pricing', () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-secret-with-more-than-thirty-two-characters';
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test server port');
    base = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
  beforeEach(() => {
    db.sellingPrice = 0;
    db.updates = 0;
    db.currentCost = 800;
    db.originalPrice = 850;
    db.freeDeliveryThreshold = 500;
  });

  it('rejects an arbitrary price and accepts the half-discount promotion price', async () => {
    const review = (sellingPrice: number) => fetch(`${base}/api/admin/products/5/review`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signAdminToken({ sub: '1', email: 'admin@example.test', role: 'admin' })}` },
      body: JSON.stringify({ status: 'published', sellingPrice, checklist: { exactProductMatch: true, supplierPriceChecked: true, stockChecked: true, promotionDatesChecked: true, imagesChecked: true, descriptionChecked: true } }),
    });
    const wrong = await review(920);
    expect(wrong.status).toBe(422);
    expect((await wrong.json()).error).toContain('R825.00');
    const right = await review(825);
    expect(right.status).toBe(200);
    expect((await right.json()).status).toBe('published');
    expect(db.updates).toBe(2);
  });

  it('enforces an R20 publication profit floor even when configuration is lower', async () => {
    db.currentCost = 100;
    db.originalPrice = null;
    db.freeDeliveryThreshold = 0;
    const response = await fetch(`${base}/api/admin/products/5/review`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signAdminToken({ sub: '1', email: 'admin@example.test', role: 'admin' })}` },
      body: JSON.stringify({ status: 'published', sellingPrice: 107, checklist: { exactProductMatch: true, supplierPriceChecked: true, stockChecked: true, promotionDatesChecked: true, imagesChecked: true, descriptionChecked: true } }),
    });

    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain('R120.00');
  });
});
