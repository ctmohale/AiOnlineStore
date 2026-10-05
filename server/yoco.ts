import crypto from 'node:crypto';

const DEFAULT_API_URL = 'https://payments.yoco.com/api';
const WEBHOOK_TOLERANCE_SECONDS = 180;

export type YocoCheckout = {
  id: string;
  redirectUrl: string;
  amount: number;
  currency: string;
  processingMode: 'live' | 'test';
};

type CreateCheckoutInput = {
  amountCents: number;
  orderReference: string;
  attempt: number;
};

export function isYocoConfigured() {
  return Boolean(process.env.YOCO_SECRET_KEY?.trim());
}

export function expectedYocoMode(): 'live' | 'test' | null {
  const key = process.env.YOCO_SECRET_KEY?.trim();
  if (!key) return null;
  if (key.startsWith('sk_live_')) return 'live';
  if (key.startsWith('sk_test_')) return 'test';
  return null;
}

function publicStoreUrl() {
  const configured = (process.env.STORE_PUBLIC_URL || process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
  return configured.replace(/\/$/, '');
}

export async function createYocoCheckout(input: CreateCheckoutInput): Promise<YocoCheckout> {
  const secretKey = process.env.YOCO_SECRET_KEY?.trim();
  if (!secretKey) throw Object.assign(new Error('Yoco is not configured. Add YOCO_SECRET_KEY to the API service.'), { status: 503 });
  if (!Number.isInteger(input.amountCents) || input.amountCents < 1) throw Object.assign(new Error('The quoted total is not a valid Yoco payment amount.'), { status: 422 });

  const storeUrl = publicStoreUrl();
  const confirmationUrl = `${storeUrl}/confirmation/${encodeURIComponent(input.orderReference)}`;
  const apiUrl = (process.env.YOCO_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
  const response = await fetch(`${apiUrl}/checkouts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `mzansi-${input.orderReference.toLowerCase()}-${input.attempt}`,
    },
    body: JSON.stringify({
      amount: input.amountCents,
      currency: 'ZAR',
      successUrl: `${confirmationUrl}?payment=success`,
      cancelUrl: `${confirmationUrl}?payment=cancelled`,
      failureUrl: `${confirmationUrl}?payment=failed`,
      clientReferenceId: input.orderReference,
      externalId: input.orderReference,
      metadata: { orderReference: input.orderReference },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const body = await response.json().catch(() => null) as Partial<YocoCheckout> & { message?: string } | null;
  if (!response.ok) {
    const detail = body?.message ? ` ${body.message}` : '';
    throw Object.assign(new Error(`Yoco checkout could not be created (${response.status}).${detail}`), { status: 502 });
  }
  if (!body?.id || !body.redirectUrl || !Number.isInteger(body.amount) || body.currency !== 'ZAR' || !['live', 'test'].includes(String(body.processingMode))) {
    throw Object.assign(new Error('Yoco returned an incomplete checkout response.'), { status: 502 });
  }
  if (body.amount !== input.amountCents) throw Object.assign(new Error('Yoco returned a checkout with an unexpected amount.'), { status: 502 });
  const expectedMode = expectedYocoMode();
  if (expectedMode && body.processingMode !== expectedMode) throw Object.assign(new Error('Yoco returned a checkout in the wrong processing mode.'), { status: 502 });
  return body as YocoCheckout;
}

type WebhookHeaders = { id?: string; timestamp?: string; signature?: string };

export function verifyYocoWebhook(rawBody: Buffer, headers: WebhookHeaders, nowSeconds = Math.floor(Date.now() / 1000)) {
  const secret = process.env.YOCO_WEBHOOK_SECRET?.trim();
  if (!secret?.startsWith('whsec_')) return false;
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const timestamp = Number(headers.timestamp);
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false;

  let secretBytes: Buffer;
  try { secretBytes = Buffer.from(secret.slice('whsec_'.length), 'base64'); }
  catch { return false; }
  if (!secretBytes.length) return false;
  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');
  return headers.signature.split(' ').some((candidate) => {
    const [version, signature] = candidate.split(',', 2);
    if (version !== 'v1' || !signature) return false;
    const expectedBytes = Buffer.from(expected);
    const suppliedBytes = Buffer.from(signature);
    return expectedBytes.length === suppliedBytes.length && crypto.timingSafeEqual(expectedBytes, suppliedBytes);
  });
}
