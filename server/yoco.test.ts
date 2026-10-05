import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createYocoCheckout, verifyYocoWebhook } from './yoco.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('Yoco Checkout API', () => {
  it('creates an idempotent ZAR checkout for the exact order total', async () => {
    process.env.YOCO_SECRET_KEY = 'sk_test_example';
    process.env.STORE_PUBLIC_URL = 'https://www.mzansimegastore.co.za/';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: 'ch_test_123', redirectUrl: 'https://c.yoco.com/checkout/test', amount: 172400, currency: 'ZAR', processingMode: 'test',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const checkout = await createYocoCheckout({ amountCents: 172400, orderReference: 'MMS-2026-ABC123', attempt: 1 });
    expect(checkout.id).toBe('ch_test_123');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://payments.yoco.com/api/checkouts');
    expect(new Headers(options?.headers).get('Idempotency-Key')).toBe('mzansi-mms-2026-abc123-1');
    expect(JSON.parse(String(options?.body))).toMatchObject({
      amount: 172400,
      currency: 'ZAR',
      successUrl: 'https://www.mzansimegastore.co.za/confirmation/MMS-2026-ABC123?payment=success',
      cancelUrl: 'https://www.mzansimegastore.co.za/confirmation/MMS-2026-ABC123?payment=cancelled',
      failureUrl: 'https://www.mzansimegastore.co.za/confirmation/MMS-2026-ABC123?payment=failed',
      clientReferenceId: 'MMS-2026-ABC123',
      externalId: 'MMS-2026-ABC123',
    });
  });

  it('rejects webhook tampering and timestamps outside the three-minute window', () => {
    const secretBytes = Buffer.from('unit-test-webhook-secret');
    process.env.YOCO_WEBHOOK_SECRET = `whsec_${secretBytes.toString('base64')}`;
    const rawBody = Buffer.from(JSON.stringify({ id: 'evt_123', type: 'payment.succeeded' }));
    const timestamp = '1791230400';
    const id = 'msg_123';
    const signature = crypto.createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${rawBody.toString('utf8')}`).digest('base64');
    const headers = { id, timestamp, signature: `v1,${signature}` };

    expect(verifyYocoWebhook(rawBody, headers, Number(timestamp))).toBe(true);
    expect(verifyYocoWebhook(Buffer.from(`${rawBody.toString('utf8')} `), headers, Number(timestamp))).toBe(false);
    expect(verifyYocoWebhook(rawBody, headers, Number(timestamp) + 181)).toBe(false);
  });
});
