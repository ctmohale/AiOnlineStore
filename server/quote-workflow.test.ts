import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import type { Server } from 'node:http';

const state = vi.hoisted(() => ({ status: 'requested', profitFloor: 120, marginFloor: 15, updates: 0, verifiedItems: 1 }));
vi.mock('./db/pool.js', () => ({
  pool: { execute: vi.fn() },
  withTransaction: async (callback: (connection: { execute: (sql: string) => Promise<unknown[]> }) => Promise<unknown>) => callback({
    execute: async (sql: string) => {
      if (sql.startsWith('SELECT o.product_revenue')) return [[{ product_revenue: 779, status: state.status, is_test: 0, minimum_profit: state.profitFloor, minimum_margin_percent: state.marginFloor }]];
      if (sql.startsWith('SELECT COUNT(*) AS total_items')) return [[{ total_items: 1, verified_items: state.verifiedItems, unavailable_items: 0, verified_supplier_total: state.verifiedItems ? 550 : 0 }]];
      if (sql.startsWith('UPDATE order_requests')) { state.updates++; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('INSERT INTO order_status_history')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query: ${sql}`);
    },
  }),
}));

import app from './app.js';
import { signAdminToken } from './auth.js';

let server: Server;
let base: string;
beforeAll(async () => {
  process.env.JWT_SECRET = 'test-only-secret-with-more-than-thirty-two-characters';
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

test('quotes only after supplier checking and enforces saved profit rules', async () => {
  const payload = { supplierProductCost: 550, supplierDelivery: 0, customerDeliveryCost: 0, packagingCost: 0, paymentFeeEstimate: 0, advertisingCost: 0, customerDeliveryCharged: 0 };
  const quote = () => fetch(`${base}/api/admin/orders/4/quote`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signAdminToken({ sub: '1', email: 'admin@example.test', role: 'admin' })}` }, body: JSON.stringify(payload) });
  expect((await quote()).status).toBe(409);
  state.status = 'checking_supplier'; state.verifiedItems = 0;
  expect((await quote()).status).toBe(409);
  state.verifiedItems = 1; state.profitFloor = 300;
  expect((await quote()).status).toBe(422);
  expect(state.updates).toBe(0);
  state.profitFloor = 120;
  const result = await quote();
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ profit: 229, status: 'quoted' });
  expect(state.updates).toBe(1);
});
