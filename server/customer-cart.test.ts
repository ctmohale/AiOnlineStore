import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { Server } from 'node:http';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  transactionExecute: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('./db/pool.js', () => ({
  pool: { execute: mocks.execute },
  withTransaction: mocks.withTransaction,
}));

import app from './app.js';
import { signCustomerToken } from './auth.js';

let server: Server;
let base: string;
let token: string;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-only-secret-with-more-than-thirty-two-characters';
  token = signCustomerToken({ sub: '7', email: 'customer@example.com', role: 'customer' });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  base = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  mocks.execute.mockReset();
  mocks.transactionExecute.mockReset();
  mocks.withTransaction.mockReset();
  mocks.withTransaction.mockImplementation((callback) => callback({ execute: mocks.transactionExecute }));
});

afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

test('loads a signed-in customer cart from the database', async () => {
  mocks.execute.mockResolvedValueOnce([[{ productId: 11, quantity: 3 }]]);
  const response = await fetch(`${base}/api/customer/cart`, { headers: { Authorization: `Bearer ${token}` } });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ customerId: 7, items: [{ productId: 11, quantity: 3 }] });
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('customer_cart_items'), ['7']);
});

test('replaces a signed-in customer cart transactionally', async () => {
  mocks.transactionExecute.mockImplementation(async (query: string) => query.startsWith('SELECT id FROM products') ? [[{ id: 11 }, { id: 12 }]] : [{ affectedRows: 1 }]);
  const response = await fetch(`${base}/api/customer/cart`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ productId: 11, quantity: 2 }, { productId: 12, quantity: 1 }] }),
  });
  expect(response.status).toBe(204);
  expect(mocks.transactionExecute).toHaveBeenCalledWith('DELETE FROM customer_cart_items WHERE customer_id=?', ['7']);
  expect(mocks.transactionExecute).toHaveBeenCalledWith('INSERT INTO customer_cart_items (customer_id,product_id,quantity) VALUES (?,?,?)', ['7', 11, 2]);
});

test('requires authentication for database-backed carts', async () => {
  const response = await fetch(`${base}/api/customer/cart`);
  expect(response.status).toBe(401);
});
