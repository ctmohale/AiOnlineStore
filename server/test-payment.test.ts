import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';

const db = vi.hoisted(() => ({ status: 'requested', updateCount: 0, owner: '7' }));
vi.mock('./db/pool.js', () => ({
  pool: { execute: vi.fn() },
  withTransaction: async (callback: (connection: { execute: (sql: string, params: unknown[]) => Promise<unknown[]> }) => Promise<unknown>) => callback({
    execute: async (sql: string, params: unknown[]) => {
      if (sql.startsWith('SELECT id,status,is_test')) return [[params[1] === db.owner ? { id: 12, status: db.status, is_test: 1 } : undefined].filter(Boolean)];
      if (sql.startsWith('UPDATE order_requests')) { db.status = 'test_paid'; db.updateCount++; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('INSERT INTO order_status_history')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query: ${sql}`);
    },
  }),
}));

import app from './app.js';
import { signCustomerToken } from './auth.js';

describe('customer test payment', () => {
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

  const pay = (sub: string, outcome: string) => fetch(`${base}/api/customer/orders/MY-TEST/test-payment`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signCustomerToken({ sub, email: 'customer@example.test', role: 'customer' })}` }, body: JSON.stringify({ outcome }),
  });

  it('requires ownership, keeps a failed simulation unpaid, and stores only a test paid status', async () => {
    expect((await pay('8', 'success')).status).toBe(404);
    const failed = await pay('7', 'failure');
    expect(failed.status).toBe(200);
    expect(await failed.json()).toEqual({ status: 'test_failed', charged: false });
    expect(db.updateCount).toBe(0);
    const success = await pay('7', 'success');
    expect(success.status).toBe(200);
    expect(await success.json()).toEqual({ status: 'test_paid', charged: false });
    expect(db.status).toBe('test_paid');
    expect(db.updateCount).toBe(1);
    expect((await pay('7', 'success')).status).toBe(409);
  });
});
