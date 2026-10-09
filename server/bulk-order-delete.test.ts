import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { Server } from 'node:http';

const mocks = vi.hoisted(() => ({
  transactionExecute: vi.fn(),
  withTransaction: vi.fn(),
  orders: [] as { id:number; reference:string; status:string; is_test:number }[],
  payments: [] as { order_request_id:number; verification_status:string }[],
}));

vi.mock('./db/pool.js', () => ({
  pool: { execute: vi.fn() },
  withTransaction: mocks.withTransaction,
}));

import app from './app.js';
import { signAdminToken } from './auth.js';

let server: Server;
let base: string;
const adminAuthorization = () => `Bearer ${signAdminToken({ sub: '1', email: 'admin@example.test', role: 'admin' })}`;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-only-secret-with-more-than-thirty-two-characters';
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  base = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  mocks.orders = [
    { id: 4, reference: 'MMS-CHK-2026-AAA111', status: 'awaiting_payment', is_test: 0 },
    { id: 9, reference: 'MMS-2026-BBB222', status: 'cancelled', is_test: 0 },
  ];
  mocks.payments = [{ order_request_id: 4, verification_status: 'unverified' }];
  mocks.transactionExecute.mockReset();
  mocks.transactionExecute.mockImplementation(async (sql: string) => {
    if (sql.startsWith('SELECT order_request_id,verification_status')) return [mocks.payments];
    if (sql.startsWith('SELECT id,reference,status,is_test')) return [mocks.orders];
    if (sql.startsWith('DELETE FROM email_outbox')) return [{ affectedRows: 1 }];
    if (sql.startsWith('UPDATE order_requests SET deleted_at')) return [{ affectedRows: mocks.orders.length }];
    throw new Error(`Unexpected query: ${sql}`);
  });
  mocks.withTransaction.mockReset();
  mocks.withTransaction.mockImplementation((callback) => callback({ execute: mocks.transactionExecute }));
});

afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

test('atomically removes selected unpaid orders from the queue and cancels their queued unsent emails', async () => {
  const response = await fetch(`${base}/api/admin/orders`, {
    method: 'DELETE',
    headers: { Authorization: adminAuthorization(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [9, 4, 9] }),
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ deleted: 2 });
  expect(mocks.transactionExecute).toHaveBeenCalledWith(expect.stringContaining('UPDATE order_requests SET deleted_at'), ['1', 4, 9]);
  expect(mocks.transactionExecute.mock.calls.filter(([sql]) => String(sql).startsWith('DELETE FROM email_outbox'))).toHaveLength(2);
});

test('rejects the complete selection when it includes a paid order', async () => {
  mocks.orders[1].status = 'paid';
  mocks.payments.push({ order_request_id: 9, verification_status: 'verified' });
  const response = await fetch(`${base}/api/admin/orders`, {
    method: 'DELETE', headers: { Authorization: adminAuthorization(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [4, 9] }),
  });

  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain('MMS-2026-BBB222');
  expect(mocks.transactionExecute.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE order_requests SET deleted_at'))).toBe(false);
});

test('protects an awaiting-payment order if its payment was already verified', async () => {
  mocks.orders = [mocks.orders[0]];
  mocks.payments = [{ order_request_id: 4, verification_status: 'verified' }];
  const response = await fetch(`${base}/api/admin/orders`, {
    method: 'DELETE', headers: { Authorization: adminAuthorization(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [4] }),
  });

  expect(response.status).toBe(409);
  expect(mocks.transactionExecute.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE order_requests SET deleted_at'))).toBe(false);
});

test('only full administrators can bulk-delete orders', async () => {
  const authorization = `Bearer ${signAdminToken({ sub: '2', email: 'operator@example.test', role: 'operator' })}`;
  const response = await fetch(`${base}/api/admin/orders`, {
    method: 'DELETE', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [4] }),
  });
  expect(response.status).toBe(403);
  expect(mocks.withTransaction).not.toHaveBeenCalled();
});
