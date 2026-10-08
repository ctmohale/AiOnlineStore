import crypto from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ events: new Set<string>(), paymentUpdates: 0, orderUpdates: 0, historyWrites: 0, cartCleanupQueries: 0, confirmedReference: '', outcome: '', queuedEmails: [] as string[] }));

vi.mock('./email.js', () => ({
  enqueueAccountEmail: vi.fn(),
  enqueueOrderEmail: vi.fn(async (_connection, _orderId, kind: string) => { state.queuedEmails.push(kind); }),
}));

vi.mock('./db/pool.js', () => ({
  pool: { execute: vi.fn() },
  withTransaction: async (callback: (connection: { execute: (sql: string, params: unknown[]) => Promise<unknown[]> }) => Promise<unknown>) => callback({
    execute: async (sql: string, params: unknown[]) => {
      if (sql.startsWith('INSERT IGNORE INTO payment_webhook_events')) {
        const eventId = String(params[0]);
        if (state.events.has(eventId)) return [{ affectedRows: 0 }];
        state.events.add(eventId); return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('SELECT pr.id AS payment_reference_id')) return [[{ payment_reference_id: 5, expected_amount_cents: 172400, currency: 'ZAR', processing_mode: 'test', verification_status: 'unverified', order_id: 9, order_reference: 'MMS-CHK-2026-ABC123', order_status: 'awaiting_payment', is_test: 0 }]];
      if (sql.startsWith('UPDATE payment_references')) { state.paymentUpdates++; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('UPDATE order_requests')) { state.orderUpdates++; state.confirmedReference = String(params[0]); return [{ affectedRows: 1 }]; }
      if (sql.startsWith('INSERT INTO order_status_history')) { state.historyWrites++; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('DELETE ci FROM customer_cart_items') || sql.startsWith('UPDATE customer_cart_items ci')) { state.cartCleanupQueries++; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('UPDATE payment_webhook_events')) { state.outcome = String(params[0] ?? sql.match(/processing_outcome='([^']+)'/)?.[1]); return [{ affectedRows: 1 }]; }
      throw new Error(`Unexpected query: ${sql}`);
    },
  }),
}));

import app from './app.js';

describe('Yoco webhook endpoint', () => {
  let server: Server;
  let base: string;
  const secretBytes = Buffer.from('webhook-route-test-secret');
  const secret = `whsec_${secretBytes.toString('base64')}`;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-secret-with-more-than-thirty-two-characters';
    process.env.YOCO_WEBHOOK_SECRET = secret;
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test server port');
    base = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
  beforeEach(() => {
    state.events.clear();
    state.paymentUpdates = 0;
    state.orderUpdates = 0;
    state.historyWrites = 0;
    state.cartCleanupQueries = 0;
    state.confirmedReference = '';
    state.outcome = '';
    state.queuedEmails.length = 0;
  });

  const send = (event: Record<string, unknown>, valid = true) => {
    const body = JSON.stringify(event);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const id = String(event.id);
    const signature = crypto.createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${body}`).digest('base64');
    return fetch(`${base}/api/payments/yoco/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${valid ? signature : 'invalid'}` }, body });
  };

  it('rejects unsigned data and applies a matching successful payment once', async () => {
    const event = { id: 'evt_success_1', type: 'payment.succeeded', payload: { id: 'pay_1', amount: 172400, currency: 'ZAR', mode: 'test', status: 'succeeded', metadata: { checkoutId: 'ch_test_123' } } };
    expect((await send(event, false)).status).toBe(403);
    expect(state.paymentUpdates).toBe(0);

    const accepted = await send(event);
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({ received: true, duplicate: false, outcome: 'payment_verified' });
    expect(state.paymentUpdates).toBe(1);
    expect(state.orderUpdates).toBe(1);
    expect(state.confirmedReference).toMatch(/^MMS-\d{4}-[A-F0-9]{6}$/);
    expect(state.confirmedReference).not.toContain('-CHK-');
    expect(state.historyWrites).toBe(1);
    expect(state.cartCleanupQueries).toBe(2);
    expect(state.queuedEmails).toEqual(['payment_confirmed', 'admin_new_order']);

    const duplicate = await send(event);
    expect(await duplicate.json()).toMatchObject({ duplicate: true, outcome: 'already_processed' });
    expect(state.paymentUpdates).toBe(1);
    expect(state.orderUpdates).toBe(1);
    expect(state.historyWrites).toBe(1);
    expect(state.cartCleanupQueries).toBe(2);
    expect(state.queuedEmails).toEqual(['payment_confirmed', 'admin_new_order']);
  });

  it('does not mark an order paid when Yoco reports a different amount', async () => {
    const event = { id: 'evt_mismatch_1', type: 'payment.succeeded', payload: { id: 'pay_2', amount: 100, currency: 'ZAR', mode: 'test', status: 'succeeded', metadata: { checkoutId: 'ch_test_123' } } };
    const accepted = await send(event);
    expect(await accepted.json()).toMatchObject({ received: true, outcome: 'rejected_payment_mismatch' });
    expect(state.paymentUpdates).toBe(0);
    expect(state.orderUpdates).toBe(0);
    expect(state.cartCleanupQueries).toBe(0);
  });

  it('keeps the account cart when Yoco reports a failed payment', async () => {
    const event = { id: 'evt_failed_1', type: 'payment.failed', payload: { id: 'pay_3', amount: 172400, currency: 'ZAR', mode: 'test', status: 'failed', metadata: { checkoutId: 'ch_test_123' } } };
    const accepted = await send(event);
    expect(await accepted.json()).toMatchObject({ received: true, outcome: 'payment_failed' });
    expect(state.paymentUpdates).toBe(1);
    expect(state.orderUpdates).toBe(0);
    expect(state.cartCleanupQueries).toBe(0);
    expect(state.queuedEmails).toEqual(['payment_failed']);
  });
});
