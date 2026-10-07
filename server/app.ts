import 'dotenv/config';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { calculateProfit, passesPricingRules, recommendedSellingPrice } from '../shared/domain.js';
import { addBusinessDays, deliveryEstimate } from '../shared/delivery.js';
import { publicProductSlugBase, sanitizePublicProductName, sanitizePublicProductSpecs, sanitizePublicProductText } from '../shared/public-product.js';
import { requireAdmin, requireCustomer, signAdminToken, signCustomerToken } from './auth.js';
import { pool, withTransaction } from './db/pool.js';
import { importProductUrl } from './product-import.js';
import { adminCustomerUpdateSchema, adminPasswordUpdateSchema, adminProductCreateSchema, adminProductUpdateSchema, customerCartItemSchema, customerCartSchema, customerEmailVerificationSchema, customerForgotPasswordSchema, customerLoginSchema, customerPasswordResetSchema, customerPasswordUpdateSchema, customerProfileUpdateSchema, customerRegisterSchema, customerVerificationResendSchema, orderFulfilmentSchema, orderSchema, orderStatusSchema, paymentConfirmationSchema, supplierItemVerificationSchema, supportCaseCreateSchema, supportCaseUpdateSchema, paymentLinkSchema, pricingSettingsSchema, productReviewSchema, productUrlImportSchema, quoteSchema } from './validation.js';
import { createYocoCheckout, expectedYocoMode, isYocoConfigured, verifyYocoWebhook } from './yoco.js';
import { enqueueAccountEmail, enqueueOrderEmail } from './email.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.disable('etag');
app.use('/api', helmet());
app.use(cors({ origin: process.env.FRONTEND_URL?.split(',') || ['http://localhost:5173'], methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '200kb', verify: (request, _response, buffer) => { (request as unknown as { rawBody?: Buffer }).rawBody = Buffer.from(buffer); } }));

const publicLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
const reference = () => `MMS-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
const productSlug = (title: string) => `${publicProductSlugBase(title).slice(0, 170)}-${crypto.randomBytes(3).toString('hex')}`;
const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 60;
type EmailChallengePurpose = 'registration' | 'password_reset';
type EmailChallengeCustomer = { id: number; email: string; name: string };

function emailOtpSecret() {
  const secret = process.env.EMAIL_OTP_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw Object.assign(new Error('Email verification is not configured'), { status: 503 });
  return secret;
}

const generateEmailCode = () => String(crypto.randomInt(100000, 1_000_000));
const hashEmailCode = (customerId: number, purpose: EmailChallengePurpose, code: string) => crypto.createHmac('sha256', emailOtpSecret()).update(`${customerId}:${purpose}:${code}`).digest('hex');
function emailCodeMatches(customerId: number, purpose: EmailChallengePurpose, code: string, expectedHash: string) {
  const actual = Buffer.from(hashEmailCode(customerId, purpose, code), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function issueEmailChallenge(connection: PoolConnection, customer: EmailChallengeCustomer, purpose: EmailChallengePurpose, enforceCooldown = false) {
  if (enforceCooldown) {
    const [recentRows] = await connection.execute('SELECT TIMESTAMPDIFF(SECOND,created_at,UTC_TIMESTAMP()) AS age_seconds FROM customer_email_challenges WHERE customer_id=? AND purpose=? ORDER BY id DESC LIMIT 1', [customer.id, purpose]);
    const recent = (recentRows as (RowDataPacket & { age_seconds: number })[])[0];
    if (recent && Number(recent.age_seconds) < OTP_RESEND_SECONDS) return { sent: false, retryAfterSeconds: OTP_RESEND_SECONDS - Number(recent.age_seconds) };
  }
  const code = generateEmailCode();
  await connection.execute('UPDATE customer_email_challenges SET consumed_at=COALESCE(consumed_at,UTC_TIMESTAMP()) WHERE customer_id=? AND purpose=? AND consumed_at IS NULL', [customer.id, purpose]);
  const [result] = await connection.execute('INSERT INTO customer_email_challenges (customer_id,purpose,code_hash,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? MINUTE))', [customer.id, purpose, hashEmailCode(customer.id, purpose, code), OTP_EXPIRY_MINUTES]);
  const challengeId = Number((result as { insertId: number }).insertId);
  const kind = purpose === 'registration' ? 'verify_email' : 'password_reset';
  await enqueueAccountEmail(connection, customer, kind, `customer:${customer.id}:${purpose}:${challengeId}`, { code, expiresMinutes: OTP_EXPIRY_MINUTES });
  return { sent: true, retryAfterSeconds: OTP_RESEND_SECONDS };
}

async function consumeEmailChallenge(connection: PoolConnection, customerId: number, purpose: EmailChallengePurpose, code: string) {
  const [rows] = await connection.execute('SELECT id,code_hash,attempts,(expires_at>UTC_TIMESTAMP()) AS is_active FROM customer_email_challenges WHERE customer_id=? AND purpose=? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE', [customerId, purpose]);
  const challenge = (rows as (RowDataPacket & { id: number; code_hash: string; attempts: number; is_active: number })[])[0];
  if (!challenge || !challenge.is_active || Number(challenge.attempts) >= OTP_MAX_ATTEMPTS) return 'invalid' as const;
  if (!emailCodeMatches(customerId, purpose, code, challenge.code_hash)) {
    await connection.execute(`UPDATE customer_email_challenges SET attempts=attempts+1,consumed_at=IF(attempts+1>=?,UTC_TIMESTAMP(),consumed_at) WHERE id=?`, [OTP_MAX_ATTEMPTS, challenge.id]);
    return 'invalid' as const;
  }
  await connection.execute('UPDATE customer_email_challenges SET consumed_at=UTC_TIMESTAMP() WHERE customer_id=? AND purpose=? AND consumed_at IS NULL', [customerId, purpose]);
  return 'accepted' as const;
}

type ProductImageRow = RowDataPacket & { product_id: number; url: string; alt_text: string; sort_order: number };
async function withProductImages(rows: RowDataPacket[]) {
  if (!pool || rows.length === 0) return rows;
  const ids = rows.map((row) => Number(row.id));
  const [imageRows] = await pool.execute(`SELECT product_id,url,alt_text,sort_order FROM product_images WHERE product_id IN (${ids.map(() => '?').join(',')}) ORDER BY product_id,sort_order,id`, ids);
  const grouped = new Map<number, ProductImageRow[]>();
  for (const image of imageRows as ProductImageRow[]) grouped.set(Number(image.product_id), [...(grouped.get(Number(image.product_id)) || []), image]);
  return rows.map((row) => ({ ...row, images: grouped.get(Number(row.id)) || [] }));
}

const withDeliveryEstimates = (rows: RowDataPacket[], province?: string) => rows.map((row) => ({ ...row, delivery_estimate: deliveryEstimate({ retailer: String(row.retailer || ''), fulfilmentType: String(row.fulfilment_type || 'unknown'), stockStatus: String(row.stock_status || 'unknown'), province }) }));

const sanitizePublicProducts = (rows: Record<string, unknown>[]) => rows.map((product) => {
  let specifications: Record<string, string> = {};
  if (product.specifications && typeof product.specifications === 'object') specifications = product.specifications as Record<string, string>;
  if (typeof product.specifications === 'string') {
    try { specifications = JSON.parse(product.specifications) as Record<string, string>; } catch { specifications = {}; }
  }
  const name = sanitizePublicProductName(product.title);
  const images = Array.isArray(product.images) ? product.images.map((image) => {
    const item = image as Record<string, unknown>;
    return { ...item, alt_text: sanitizePublicProductText(item.alt_text) || name };
  }) : product.images;
  return {
    ...product,
    title: name,
    model: sanitizePublicProductText(product.model),
    pack_size: sanitizePublicProductText(product.pack_size),
    description: sanitizePublicProductText(product.description),
    specifications: sanitizePublicProductSpecs(specifications),
    images,
  };
});

async function replaceProductImages(connection: PoolConnection, productId: number | string, title: string, urls: string[]) {
  const unique = [...new Set(urls.filter(Boolean))].slice(0, 20);
  await connection.execute('DELETE FROM product_images WHERE product_id=?', [productId]);
  for (const [index, url] of unique.entries()) await connection.execute('INSERT INTO product_images (product_id,url,alt_text,sort_order) VALUES (?,?,?,?)', [productId, url, `${title} - image ${index + 1}`, index]);
}

async function removePurchasedCartItems(connection: PoolConnection, orderId: number | string) {
  // Remove only the quantities paid for by this order. Anything the customer
  // added later on another device must remain in their account cart.
  await connection.execute(`DELETE ci FROM customer_cart_items ci
    JOIN order_requests o ON o.customer_id=ci.customer_id AND o.id=?
    JOIN order_items oi ON oi.order_request_id=o.id AND oi.product_id=ci.product_id
    WHERE ci.quantity<=oi.quantity`, [orderId]);
  await connection.execute(`UPDATE customer_cart_items ci
    JOIN order_requests o ON o.customer_id=ci.customer_id AND o.id=?
    JOIN order_items oi ON oi.order_request_id=o.id AND oi.product_id=ci.product_id
    SET ci.quantity=ci.quantity-oi.quantity,ci.updated_at=UTC_TIMESTAMP()
    WHERE ci.quantity>oi.quantity`, [orderId]);
}

type PaymentOrderRow = RowDataPacket & { id: number; reference: string; status: string; is_test: number; product_revenue: number; customer_delivery_charged: number };

async function provisionYocoCheckout(orderId: string | number) {
  if (!pool) throw Object.assign(new Error('Database not configured'), { status: 503 });
  if (!isYocoConfigured()) throw Object.assign(new Error('Yoco is not configured. Add YOCO_SECRET_KEY to the API service.'), { status: 503 });
  const [orderRows] = await pool.execute('SELECT id,reference,status,is_test,product_revenue,customer_delivery_charged FROM order_requests WHERE id=? LIMIT 1', [orderId]);
  const order = (orderRows as PaymentOrderRow[])[0];
  if (!order || order.is_test) throw Object.assign(new Error('Real order not found'), { status: 404 });
  if (!['requested', 'quoted', 'awaiting_payment'].includes(order.status)) throw Object.assign(new Error('This order cannot receive a Yoco checkout.'), { status: 409 });

  const [activeRows] = await pool.execute("SELECT external_reference,payment_link,expected_amount_cents,currency,processing_mode FROM payment_references WHERE order_request_id=? AND provider='yoco' AND verification_status='unverified' ORDER BY id DESC LIMIT 1", [orderId]);
  const active = (activeRows as (RowDataPacket & { external_reference: string; payment_link: string; expected_amount_cents: number; currency: string; processing_mode: string })[])[0];
  const amountCents = Math.round((Number(order.product_revenue) + Number(order.customer_delivery_charged)) * 100);
  if (active && Number(active.expected_amount_cents) === amountCents && active.currency === 'ZAR') {
    if (order.status !== 'awaiting_payment') await withTransaction(async (connection) => {
      const [lockedRows] = await connection.execute('SELECT status,is_test FROM order_requests WHERE id=? FOR UPDATE', [orderId]);
      const locked = (lockedRows as (RowDataPacket & { status: string; is_test: number })[])[0];
      if (!locked || locked.is_test || !['requested', 'quoted', 'awaiting_payment'].includes(locked.status)) throw Object.assign(new Error('The order is no longer awaiting checkout creation.'), { status: 409 });
      if (locked.status !== 'awaiting_payment') {
        await connection.execute("UPDATE order_requests SET status='awaiting_payment' WHERE id=?", [orderId]);
        await connection.execute("INSERT INTO order_status_history (order_request_id,from_status,to_status,note) VALUES (?,?,'awaiting_payment','Secure Yoco checkout reused')", [orderId, locked.status]);
      }
    });
    return { checkoutId: active.external_reference, paymentLink: active.payment_link, amountCents, processingMode: active.processing_mode, reused: true };
  }

  const [attemptRows] = await pool.execute("SELECT COUNT(*) AS attempts FROM payment_references WHERE order_request_id=? AND provider='yoco'", [orderId]);
  const attempt = Number((attemptRows as (RowDataPacket & { attempts: number })[])[0]?.attempts || 0) + 1;
  const checkout = await createYocoCheckout({ amountCents, orderReference: order.reference, attempt });

  await withTransaction(async (connection) => {
    const [lockedRows] = await connection.execute('SELECT status,is_test,product_revenue,customer_delivery_charged FROM order_requests WHERE id=? FOR UPDATE', [orderId]);
    const locked = (lockedRows as (RowDataPacket & { status: string; is_test: number; product_revenue: number; customer_delivery_charged: number })[])[0];
    if (!locked || locked.is_test || !['requested', 'quoted', 'awaiting_payment'].includes(locked.status)) throw Object.assign(new Error('The order is no longer awaiting checkout creation.'), { status: 409 });
    const lockedAmount = Math.round((Number(locked.product_revenue) + Number(locked.customer_delivery_charged)) * 100);
    if (lockedAmount !== checkout.amount) throw Object.assign(new Error('The quoted order total changed before checkout creation.'), { status: 409 });
    await connection.execute(`INSERT INTO payment_references (order_request_id,provider,payment_link,external_reference,expected_amount_cents,currency,processing_mode)
      VALUES (?,'yoco',?,?,?,?,?) ON DUPLICATE KEY UPDATE payment_link=VALUES(payment_link),expected_amount_cents=VALUES(expected_amount_cents),currency=VALUES(currency),processing_mode=VALUES(processing_mode)`, [orderId, checkout.redirectUrl, checkout.id, checkout.amount, checkout.currency, checkout.processingMode]);
    if (locked.status !== 'awaiting_payment') {
      await connection.execute("UPDATE order_requests SET status='awaiting_payment' WHERE id=?", [orderId]);
      await connection.execute("INSERT INTO order_status_history (order_request_id,from_status,to_status,note) VALUES (?,?,'awaiting_payment','Secure Yoco checkout created')", [orderId, locked.status]);
    }
  });
  return { checkoutId: checkout.id, paymentLink: checkout.redirectUrl, amountCents: checkout.amount, processingMode: checkout.processingMode, reused: false };
}

async function assertProductPublishable(connection: PoolConnection, productId: number | string) {
  const [rows] = await connection.execute(`SELECT p.title,p.category,p.model,p.pack_size,p.selling_price,p.minimum_profit,p.estimated_customer_delivery_cost,i.url AS image_url,(SELECT COUNT(*) FROM product_images gallery WHERE gallery.product_id=p.id) AS image_count,
    o.id AS offer_id,o.source_url,o.current_cost,o.original_displayed_price,o.stock_status,o.last_checked_at,o.promotion_end_at,o.price_verified,o.supplier_delivery_cost,
    s.minimum_profit AS global_minimum_profit,s.minimum_margin_percent,s.standard_markup_percent,s.free_delivery_threshold,s.standard_customer_delivery,s.supplier_stale_hours
    FROM products p LEFT JOIN product_images i ON i.product_id=p.id AND i.sort_order=0 LEFT JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1)
    JOIN pricing_settings s ON s.id=1 WHERE p.id=? AND p.deleted_at IS NULL FOR UPDATE`, [productId]);
  const product = (rows as (RowDataPacket & Record<string, unknown>)[])[0];
  if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
  const missing: string[] = [];
  if (!String(product.title || '').trim()) missing.push('product name');
  if (!String(product.category || '').trim()) missing.push('category');
  if (!String(product.image_url || '').startsWith('https://')) missing.push('public HTTPS product image');
  if (Number(product.image_count || 0) < 1) missing.push('at least one genuine product image');
  if (!String(product.model || '').trim() && !String(product.pack_size || '').trim()) missing.push('exact model or pack size');
  if (!product.offer_id) missing.push('supplier offer');
  if (!String(product.source_url || '').trim()) missing.push('supplier URL');
  if (product.current_cost == null || Number(product.current_cost) <= 0 || !product.price_verified) missing.push('verified supplier price');
  if (!product.last_checked_at) missing.push('last checked time');
  if (!['in_stock', 'low_stock'].includes(String(product.stock_status || ''))) missing.push('in-stock status');
  if (missing.length) throw Object.assign(new Error(`Cannot publish until these fields are complete: ${missing.join(', ')}`), { status: 422 });
  const now = Date.now();
  if (now - new Date(product.last_checked_at as string | Date).getTime() > Number(product.supplier_stale_hours) * 3_600_000) throw Object.assign(new Error('The supplier check is stale; recheck it before publishing'), { status: 422 });
  if (product.promotion_end_at && new Date(product.promotion_end_at as string | Date).getTime() <= now) throw Object.assign(new Error('The supplier promotion has ended; recheck the price before publishing'), { status: 422 });
  const target = recommendedSellingPrice({ cost: Number(product.current_cost), originalPrice: product.original_displayed_price == null ? null : Number(product.original_displayed_price), promotionEndAt: product.promotion_end_at as Date | null }, Number(product.standard_markup_percent));
  if (Math.abs(Number(product.selling_price) - target.sellingPrice) > 0.001) throw Object.assign(new Error(`Selling price must follow the source pricing rule: R${target.sellingPrice.toFixed(2)}`), { status: 422 });
  const deliveryCharged = Number(product.selling_price) >= Number(product.free_delivery_threshold) ? 0 : Number(product.standard_customer_delivery);
  const pricing = passesPricingRules({ productRevenue: Number(product.selling_price), customerDeliveryCharged: deliveryCharged, supplierProductCost: Number(product.current_cost), supplierDelivery: Number(product.supplier_delivery_cost || 0), customerDeliveryCost: Number(product.estimated_customer_delivery_cost || 0), packaging: 0, paymentFees: 0, advertisingCost: 0 }, Number(product.minimum_profit ?? product.global_minimum_profit), Number(product.minimum_margin_percent));
  if (!pricing.passes || pricing.profit <= 0) throw Object.assign(new Error(`Estimated profit is below the product guardrail (${pricing.margin.toFixed(1)}% margin, R${pricing.profit.toFixed(2)} profit)`), { status: 422 });
  return pricing;
}

app.get('/health', async (_request, response) => {
  const revision = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || 'unknown';
  if (!pool) return response.status(process.env.NODE_ENV === 'production' ? 503 : 200).json({ status: 'degraded', database: 'not_configured', mode: 'database_required', revision });
  try { await pool.query('SELECT 1'); response.json({ status: 'ok', database: 'connected', revision }); }
  catch { response.status(503).json({ status: 'unhealthy', database: 'unavailable', revision }); }
});

app.post('/api/payments/yoco/webhook', async (request, response, next) => {
  try {
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    if (!process.env.YOCO_WEBHOOK_SECRET) return response.status(503).json({ error: 'Yoco webhook verification is not configured' });
    const rawBody = (request as Request & { rawBody?: Buffer }).rawBody;
    const webhookId = request.header('webhook-id') || undefined;
    const webhookTimestamp = request.header('webhook-timestamp') || undefined;
    const webhookSignature = request.header('webhook-signature') || undefined;
    if (!rawBody || !verifyYocoWebhook(rawBody, { id: webhookId, timestamp: webhookTimestamp, signature: webhookSignature })) return response.status(403).json({ error: 'Invalid Yoco webhook signature' });

    const event = request.body as { id?: unknown; type?: unknown; payload?: { id?: unknown; amount?: unknown; currency?: unknown; mode?: unknown; status?: unknown; metadata?: { checkoutId?: unknown } } };
    const eventId = typeof event.id === 'string' && event.id ? event.id : webhookId;
    const eventType = typeof event.type === 'string' ? event.type : '';
    const payment = event.payload;
    const checkoutId = typeof payment?.metadata?.checkoutId === 'string' ? payment.metadata.checkoutId : '';
    const paymentId = typeof payment?.id === 'string' ? payment.id : null;
    const amountCents = Number(payment?.amount);
    const currency = typeof payment?.currency === 'string' ? payment.currency : '';
    const mode = typeof payment?.mode === 'string' ? payment.mode : '';
    if (!eventId || !['payment.succeeded', 'payment.failed'].includes(eventType) || !checkoutId || !Number.isInteger(amountCents) || !currency || !['live', 'test'].includes(mode)) return response.status(400).json({ error: 'Invalid Yoco webhook payload' });

    const result = await withTransaction(async (connection) => {
      const [insertResult] = await connection.execute(`INSERT IGNORE INTO payment_webhook_events (provider,event_id,event_type,checkout_id,provider_payment_id,amount_cents,currency,processing_mode,processing_outcome)
        VALUES ('yoco',?,?,?,?,?,?,?,'received')`, [eventId, eventType, checkoutId, paymentId, amountCents, currency, mode]);
      if ((insertResult as { affectedRows: number }).affectedRows === 0) return { duplicate: true, outcome: 'already_processed' };

      const [referenceRows] = await connection.execute(`SELECT pr.id AS payment_reference_id,pr.expected_amount_cents,pr.currency,pr.processing_mode,pr.verification_status,o.id AS order_id,o.status AS order_status,o.is_test
        FROM payment_references pr JOIN order_requests o ON o.id=pr.order_request_id
        WHERE pr.provider='yoco' AND pr.external_reference=? FOR UPDATE`, [checkoutId]);
      const reference = (referenceRows as (RowDataPacket & { payment_reference_id: number; expected_amount_cents: number; currency: string; processing_mode: string; verification_status: string; order_id: number; order_status: string; is_test: number })[])[0];
      if (!reference) {
        await connection.execute("UPDATE payment_webhook_events SET processing_outcome='ignored_unknown_checkout' WHERE provider='yoco' AND event_id=?", [eventId]);
        return { duplicate: false, outcome: 'ignored_unknown_checkout' };
      }
      const expectedMode = reference.processing_mode || expectedYocoMode();
      if (Number(reference.expected_amount_cents) !== amountCents || reference.currency !== currency || (expectedMode && expectedMode !== mode) || Boolean(reference.is_test)) {
        await connection.execute("UPDATE payment_webhook_events SET processing_outcome='rejected_payment_mismatch' WHERE provider='yoco' AND event_id=?", [eventId]);
        return { duplicate: false, outcome: 'rejected_payment_mismatch' };
      }

      if (eventType === 'payment.failed') {
        await connection.execute("UPDATE payment_references SET verification_status='failed',provider_payment_id=?,failure_reason='Yoco reported that the payment failed' WHERE id=? AND verification_status='unverified'", [paymentId, reference.payment_reference_id]);
        await connection.execute("UPDATE payment_webhook_events SET processing_outcome='payment_failed' WHERE provider='yoco' AND event_id=?", [eventId]);
        await enqueueOrderEmail(connection, reference.order_id, 'payment_failed', { eventKey: `yoco:${eventId}:payment_failed`, paymentMode: mode });
        return { duplicate: false, outcome: 'payment_failed' };
      }

      await connection.execute("UPDATE payment_references SET verification_status='verified',provider_payment_id=?,failure_reason=NULL,verified_at=UTC_TIMESTAMP() WHERE id=?", [paymentId, reference.payment_reference_id]);
      if (reference.order_status === 'awaiting_payment') {
        await connection.execute("UPDATE order_requests SET status='paid' WHERE id=? AND status='awaiting_payment'", [reference.order_id]);
        await connection.execute("INSERT INTO order_status_history (order_request_id,from_status,to_status,note) VALUES (?,'awaiting_payment','paid','Yoco payment verified automatically')", [reference.order_id]);
        await removePurchasedCartItems(connection, reference.order_id);
        await enqueueOrderEmail(connection, reference.order_id, 'payment_confirmed', { eventKey: `yoco:${eventId}:payment_confirmed`, paymentMode: mode });
      }
      const outcome = reference.order_status === 'awaiting_payment' || reference.order_status === 'paid' ? 'payment_verified' : 'payment_verified_order_not_payable';
      await connection.execute('UPDATE payment_webhook_events SET processing_outcome=? WHERE provider=\'yoco\' AND event_id=?', [outcome, eventId]);
      return { duplicate: false, outcome };
    });
    response.status(200).json({ received: true, ...result });
  } catch (error) { next(error); }
});

app.get('/api/products', async (request, response, next) => {
  try {
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const search = String(request.query.q || '');
    const category = String(request.query.category || '');
    const terms: string[] = ["p.status = 'published'", 'p.deleted_at IS NULL', 'p.gallery_image_count >= 1', 'o.price_verified = TRUE', "o.stock_status IN ('in_stock','low_stock')", '(o.promotion_end_at IS NULL OR o.promotion_end_at > UTC_TIMESTAMP())'];
    const params: (string | number)[] = [];
    if (search) { terms.push('(p.title LIKE ? OR p.brand LIKE ? OR p.model LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (category) { terms.push('p.category = ?'); params.push(category); }
    const ids = String(request.query.ids || '').split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 24);
    if (ids.length) { terms.push(`p.id IN (${ids.map(() => '?').join(',')})`); params.push(...ids); }
    const [rows] = await pool.execute(`SELECT COALESCE(demand.units_sold,0) AS units_sold,COALESCE(demand.recent_units,0) AS recent_units,COALESCE(demand.trending_units,0) AS trending_units,p.id,p.slug,p.title,p.brand,p.model,p.pack_size,p.category,p.description,p.specifications,p.selling_price,o.original_displayed_price,o.promotion_start_at,o.promotion_end_at,o.retailer,o.stock_status,o.fulfilment_type,o.fulfilment_signal,o.last_checked_at,(o.last_checked_at IS NULL OR o.last_checked_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL COALESCE(s.supplier_stale_hours,24) HOUR)) AS supplier_check_required,i.url AS image_url FROM products p JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC LIMIT 1) LEFT JOIN product_images i ON i.product_id=p.id AND i.sort_order=0 LEFT JOIN pricing_settings s ON s.id=1 LEFT JOIN (
      SELECT oi.product_id,SUM(oi.quantity) AS units_sold,
        SUM(CASE WHEN orders.created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY) THEN oi.quantity ELSE 0 END) AS recent_units,
        SUM(CASE WHEN orders.created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY) THEN oi.quantity ELSE 0 END) AS trending_units
      FROM order_items oi JOIN order_requests orders ON orders.id=oi.order_request_id
      WHERE orders.is_test=FALSE AND orders.status IN ('paid','purchasing','shipped','delivered') GROUP BY oi.product_id
    ) demand ON demand.product_id=p.id WHERE ${terms.join(' AND ')} ORDER BY COALESCE(demand.trending_units,0) DESC,COALESCE(demand.recent_units,0) DESC,COALESCE(demand.units_sold,0) DESC, (o.original_displayed_price IS NOT NULL AND o.original_displayed_price>o.current_cost) DESC,p.updated_at DESC LIMIT 3000`, params);
    const products = await withProductImages(withDeliveryEstimates(rows as RowDataPacket[], String(request.query.province || '')));
    response.json(sanitizePublicProducts(products));
  } catch (error) { next(error); }
});

app.get('/api/seo/sitemap', async (_request, response, next) => {
  try {
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const [rows] = await pool.execute(`SELECT p.slug,p.updated_at FROM products p JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1) WHERE p.status='published' AND p.deleted_at IS NULL AND p.gallery_image_count>=1 AND o.price_verified=TRUE AND o.stock_status IN ('in_stock','low_stock') AND (o.promotion_end_at IS NULL OR o.promotion_end_at>UTC_TIMESTAMP()) ORDER BY p.updated_at DESC LIMIT 50000`);
    response.set('Cache-Control', 'public, max-age=3600').json(rows);
  } catch (error) { next(error); }
});

app.get('/api/products/:slug', async (request, response, next) => {
  try {
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const [rows] = await pool.execute(`SELECT p.id,p.slug,p.title,p.brand,p.model,p.pack_size,p.category,p.description,p.specifications,p.selling_price,o.original_displayed_price,o.promotion_start_at,o.promotion_end_at,o.retailer,o.stock_status,o.fulfilment_type,o.fulfilment_signal,o.last_checked_at,(o.last_checked_at IS NULL OR o.last_checked_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL COALESCE(s.supplier_stale_hours,24) HOUR)) AS supplier_check_required,i.url AS image_url
      FROM products p JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1)
      LEFT JOIN product_images i ON i.product_id=p.id AND i.sort_order=0 LEFT JOIN pricing_settings s ON s.id=1
      WHERE (p.slug=? OR EXISTS (SELECT 1 FROM product_slug_aliases alias WHERE alias.product_id=p.id AND alias.slug=?))
        AND p.status='published' AND p.deleted_at IS NULL AND p.gallery_image_count>=1 AND o.price_verified=TRUE AND o.stock_status IN ('in_stock','low_stock')
        AND (o.promotion_end_at IS NULL OR o.promotion_end_at>UTC_TIMESTAMP()) LIMIT 1`, [String(request.params.slug), String(request.params.slug)]);
    const products = sanitizePublicProducts(await withProductImages(withDeliveryEstimates(rows as RowDataPacket[], String(request.query.province || ''))));
    if (!products.length) return response.status(404).json({ error: 'Product not found' });
    response.json(products[0]);
  } catch (error) { next(error); }
});

app.get('/api/store-settings', async (_request, response, next) => {
  try {
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const [rows] = await pool.execute('SELECT free_delivery_threshold,standard_customer_delivery FROM pricing_settings WHERE id=1');
    const settings = (rows as RowDataPacket[])[0];
    if (!settings) return response.status(503).json({ error: 'Store settings are not configured' });
    response.json({ freeDeliveryThreshold: Number(settings.free_delivery_threshold), standardCustomerDelivery: Number(settings.standard_customer_delivery) });
  } catch (error) { next(error); }
});

app.post('/api/customer/register', loginLimiter, async (request, response, next) => {
  try {
    const input = customerRegisterSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const email = input.email.toLowerCase();
    const passwordHash = await bcrypt.hash(input.password, 12);
    await withTransaction(async (connection) => {
      const [existingRows] = await connection.execute('SELECT id,email,name,email_verified_at FROM customers WHERE email=? LIMIT 1 FOR UPDATE', [email]);
      const existing = (existingRows as (RowDataPacket & EmailChallengeCustomer & { email_verified_at: Date | null })[])[0];
      if (existing?.email_verified_at) throw Object.assign(new Error('An account already exists for this email'), { status: 409 });
      if (existing) {
        await issueEmailChallenge(connection, existing, 'registration', true);
        return;
      }
      const [result] = await connection.execute('INSERT INTO customers (email,password_hash,name,phone) VALUES (?,?,?,?)', [email, passwordHash, input.name, input.phone || null]);
      const id = Number((result as { insertId: number }).insertId);
      await issueEmailChallenge(connection, { id, email, name: input.name }, 'registration');
    });
    response.status(202).json({ verificationRequired: true, email, expiresInSeconds: OTP_EXPIRY_MINUTES * 60, resendAfterSeconds: OTP_RESEND_SECONDS });
  } catch (error) { next(error); }
});

app.post('/api/customer/verify-email', loginLimiter, async (request, response, next) => {
  try {
    const input = customerEmailVerificationSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const email = input.email.toLowerCase();
    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.execute('SELECT id,email,name,phone,email_verified_at FROM customers WHERE email=? LIMIT 1 FOR UPDATE', [email]);
      const customer = (rows as (RowDataPacket & EmailChallengeCustomer & { phone: string | null; email_verified_at: Date | null })[])[0];
      if (!customer) return { status: 'invalid' as const };
      if (customer.email_verified_at) return { status: 'verified' as const };
      if (await consumeEmailChallenge(connection, customer.id, 'registration', input.code) !== 'accepted') return { status: 'invalid' as const };
      await connection.execute('UPDATE customers SET email_verified_at=UTC_TIMESTAMP() WHERE id=?', [customer.id]);
      await enqueueAccountEmail(connection, customer, 'welcome', `customer:${customer.id}:welcome:verified`);
      return { status: 'accepted' as const, customer };
    });
    if (result.status === 'verified') return response.status(409).json({ error: 'This email is already verified. Sign in to continue.' });
    if (result.status !== 'accepted') return response.status(400).json({ error: 'That code is invalid or has expired. Request a new code and try again.' });
    const customer = result.customer;
    response.json({ token: signCustomerToken({ sub: String(customer.id), email: customer.email, role: 'customer' }), customer: { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone } });
  } catch (error) { next(error); }
});

app.post('/api/customer/resend-verification', loginLimiter, async (request, response, next) => {
  try {
    const input = customerVerificationResendSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const email = input.email.toLowerCase();
    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.execute('SELECT id,email,name,email_verified_at FROM customers WHERE email=? LIMIT 1 FOR UPDATE', [email]);
      const customer = (rows as (RowDataPacket & EmailChallengeCustomer & { email_verified_at: Date | null })[])[0];
      if (!customer) return { status: 'missing' as const };
      if (customer.email_verified_at) return { status: 'verified' as const };
      return { status: 'pending' as const, ...(await issueEmailChallenge(connection, customer, 'registration', true)) };
    });
    if (result.status === 'verified') return response.status(409).json({ error: 'This email is already verified. Sign in to continue.' });
    if (result.status === 'missing') return response.status(404).json({ error: 'No pending registration was found for this email.' });
    if (!result.sent) return response.status(429).json({ error: `Please wait ${result.retryAfterSeconds} seconds before requesting another code.`, retryAfterSeconds: result.retryAfterSeconds });
    response.status(202).json({ message: 'A new verification code has been sent.', expiresInSeconds: OTP_EXPIRY_MINUTES * 60, resendAfterSeconds: OTP_RESEND_SECONDS });
  } catch (error) { next(error); }
});

app.post('/api/customer/login', loginLimiter, async (request, response, next) => {
  try {
    const input = customerLoginSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const [rows] = await pool.execute('SELECT id,email,password_hash,name,phone,email_verified_at FROM customers WHERE email=? LIMIT 1', [input.email.toLowerCase()]);
    const customer = (rows as (RowDataPacket & { id: number; email: string; password_hash: string; name: string; phone: string | null; email_verified_at: Date | null })[])[0];
    if (!customer || !await bcrypt.compare(input.password, customer.password_hash)) return response.status(401).json({ error: 'Invalid email or password' });
    if (!customer.email_verified_at) return response.status(403).json({ error: 'Verify your email before signing in.', verificationRequired: true, email: customer.email });
    response.json({ token: signCustomerToken({ sub: String(customer.id), email: customer.email, role: 'customer' }), customer: { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone } });
  } catch (error) { next(error); }
});

app.post('/api/customer/forgot-password', loginLimiter, async (request, response, next) => {
  try {
    const input = customerForgotPasswordSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute('SELECT id,email,name,email_verified_at FROM customers WHERE email=? LIMIT 1 FOR UPDATE', [input.email.toLowerCase()]);
      const customer = (rows as (RowDataPacket & EmailChallengeCustomer & { email_verified_at: Date | null })[])[0];
      if (customer?.email_verified_at) await issueEmailChallenge(connection, customer, 'password_reset', true);
    });
    response.status(202).json({ message: 'If a verified account exists for that email, a password reset code has been sent.', expiresInSeconds: OTP_EXPIRY_MINUTES * 60, resendAfterSeconds: OTP_RESEND_SECONDS });
  } catch (error) { next(error); }
});

app.post('/api/customer/reset-password', loginLimiter, async (request, response, next) => {
  try {
    const input = customerPasswordResetSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const email = input.email.toLowerCase();
    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.execute('SELECT id,email,name,email_verified_at FROM customers WHERE email=? LIMIT 1 FOR UPDATE', [email]);
      const customer = (rows as (RowDataPacket & EmailChallengeCustomer & { email_verified_at: Date | null })[])[0];
      if (!customer?.email_verified_at) return 'invalid' as const;
      if (await consumeEmailChallenge(connection, customer.id, 'password_reset', input.code) !== 'accepted') return 'invalid' as const;
      await connection.execute('UPDATE customers SET password_hash=? WHERE id=?', [passwordHash, customer.id]);
      await enqueueAccountEmail(connection, customer, 'password_changed', `customer:${customer.id}:password_reset:${Date.now()}`);
      return 'accepted' as const;
    });
    if (result !== 'accepted') return response.status(400).json({ error: 'That code is invalid or has expired. Request a new code and try again.' });
    response.status(204).end();
  } catch (error) { next(error); }
});

app.get('/api/customer/me', requireCustomer, async (_request, response, next) => {
  try { if (!pool) return response.status(503).json({ error: 'Database not configured' }); const [rows] = await pool.execute('SELECT id,email,name,phone,created_at FROM customers WHERE id=?', [response.locals.customer.sub]); const customer = (rows as RowDataPacket[])[0]; if (!customer) return response.status(404).json({ error: 'Customer not found' }); response.json(customer); } catch (error) { next(error); }
});

app.patch('/api/customer/me', requireCustomer, async (request, response, next) => {
  try {
    const input = customerProfileUpdateSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const email = input.email.toLowerCase();
    await withTransaction(async (connection) => {
      const [currentRows] = await connection.execute('SELECT email FROM customers WHERE id=? LIMIT 1 FOR UPDATE', [response.locals.customer.sub]);
      const current = (currentRows as (RowDataPacket & { email: string })[])[0];
      if (!current) throw Object.assign(new Error('Customer not found'), { status: 404 });
      if (current.email.toLowerCase() !== email) throw Object.assign(new Error('Your verified email cannot be changed here. Contact support for help.'), { status: 409 });
      const [duplicates] = await connection.execute('SELECT id FROM customers WHERE email=? AND id<>? LIMIT 1 FOR UPDATE', [email, response.locals.customer.sub]);
      if ((duplicates as RowDataPacket[]).length) throw Object.assign(new Error('Another account already uses this email address'), { status: 409 });
      const [result] = await connection.execute('UPDATE customers SET name=?,email=?,phone=? WHERE id=?', [input.name, email, input.phone || null, response.locals.customer.sub]);
      if ((result as { affectedRows: number }).affectedRows === 0) throw Object.assign(new Error('Customer not found'), { status: 404 });
      await enqueueAccountEmail(connection, { id: response.locals.customer.sub, name: input.name, email }, 'profile_updated', `customer:${response.locals.customer.sub}:profile_updated:${Date.now()}`);
    });
    const customer = { id: Number(response.locals.customer.sub), name: input.name, email, phone: input.phone || null };
    response.json({ customer, token: signCustomerToken({ sub: response.locals.customer.sub, email, role: 'customer' }) });
  } catch (error) { next(error); }
});

app.patch('/api/customer/password', loginLimiter, requireCustomer, async (request, response, next) => {
  try {
    const input = customerPasswordUpdateSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const newHash = await bcrypt.hash(input.newPassword, 12);
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute('SELECT id,email,name,password_hash FROM customers WHERE id=? LIMIT 1 FOR UPDATE', [response.locals.customer.sub]);
      const customer = (rows as (RowDataPacket & { id:number; email:string; name:string; password_hash:string })[])[0];
      if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });
      if (!await bcrypt.compare(input.currentPassword, customer.password_hash)) throw Object.assign(new Error('Your current password is incorrect'), { status: 401 });
      await connection.execute('UPDATE customers SET password_hash=? WHERE id=?', [newHash, customer.id]);
      await enqueueAccountEmail(connection, customer, 'password_changed', `customer:${customer.id}:password_changed:${Date.now()}`);
    });
    response.status(204).end();
  } catch (error) { next(error); }
});

app.get('/api/customer/cart', requireCustomer, async (_request, response, next) => {
  try {
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const [rows] = await pool.execute(`SELECT ci.product_id AS productId,ci.quantity
      FROM customer_cart_items ci JOIN products p ON p.id=ci.product_id
      WHERE ci.customer_id=? AND p.status='published' AND p.deleted_at IS NULL
      ORDER BY ci.updated_at,ci.product_id`, [response.locals.customer.sub]);
    response.json({ customerId: Number(response.locals.customer.sub), items: rows });
  } catch (error) { next(error); }
});

app.put('/api/customer/cart', requireCustomer, async (request, response, next) => {
  try {
    const input = customerCartSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    await withTransaction(async (connection) => {
      if (input.items.length) {
        const ids = input.items.map((item) => item.productId);
        const [rows] = await connection.execute(`SELECT id FROM products WHERE id IN (${ids.map(() => '?').join(',')}) AND status='published' AND deleted_at IS NULL FOR UPDATE`, ids);
        if ((rows as RowDataPacket[]).length !== ids.length) throw Object.assign(new Error('One or more cart products are no longer available'), { status: 409 });
      }
      await connection.execute('DELETE FROM customer_cart_items WHERE customer_id=?', [response.locals.customer.sub]);
      for (const item of input.items) await connection.execute('INSERT INTO customer_cart_items (customer_id,product_id,quantity) VALUES (?,?,?)', [response.locals.customer.sub, item.productId, item.quantity]);
    });
    response.status(204).end();
  } catch (error) { next(error); }
});

app.put('/api/customer/cart/items/:productId', requireCustomer, async (request, response, next) => {
  try {
    const productId = Number(request.params.productId);
    if (!Number.isSafeInteger(productId) || productId < 1) return response.status(400).json({ error: 'Invalid product' });
    const input = customerCartItemSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const [products] = await pool.execute("SELECT id FROM products WHERE id=? AND status='published' AND deleted_at IS NULL LIMIT 1", [productId]);
    if (!(products as RowDataPacket[]).length) return response.status(409).json({ error: 'This product is no longer available' });
    await pool.execute(`INSERT INTO customer_cart_items (customer_id,product_id,quantity) VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE quantity=VALUES(quantity),updated_at=UTC_TIMESTAMP()`, [response.locals.customer.sub, productId, input.quantity]);
    response.status(204).end();
  } catch (error) { next(error); }
});

app.delete('/api/customer/cart/items/:productId', requireCustomer, async (request, response, next) => {
  try {
    const productId = Number(request.params.productId);
    if (!Number.isSafeInteger(productId) || productId < 1) return response.status(400).json({ error: 'Invalid product' });
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    await pool.execute('DELETE FROM customer_cart_items WHERE customer_id=? AND product_id=?', [response.locals.customer.sub, productId]);
    response.status(204).end();
  } catch (error) { next(error); }
});

app.delete('/api/customer/cart', requireCustomer, async (_request, response, next) => {
  try {
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    await pool.execute('DELETE FROM customer_cart_items WHERE customer_id=?', [response.locals.customer.sub]);
    response.status(204).end();
  } catch (error) { next(error); }
});

app.get('/api/customer/orders', requireCustomer, async (_request, response, next) => {
  try { if (!pool) return response.status(503).json({ error: 'Database not configured' }); const [rows] = await pool.execute(`SELECT o.reference,o.status,o.courier_name,o.tracking_number,o.tracking_url,o.shipped_at,o.expected_ship_at,o.expected_delivery_at,o.delivered_at,o.product_revenue,o.customer_delivery_charged,o.created_at,o.updated_at,
    COALESCE(GROUP_CONCAT(CONCAT(oi.product_title_snapshot,' × ',oi.quantity) ORDER BY oi.id SEPARATOR ', '),'No items') AS item_summary,
    (SELECT pr.payment_link FROM payment_references pr WHERE pr.order_request_id=o.id AND pr.verification_status='unverified' ORDER BY pr.id DESC LIMIT 1) AS payment_link,
    (SELECT pr.provider FROM payment_references pr WHERE pr.order_request_id=o.id AND pr.verification_status='unverified' ORDER BY pr.id DESC LIMIT 1) AS payment_provider
    FROM order_requests o LEFT JOIN order_items oi ON oi.order_request_id=o.id WHERE o.customer_id=? AND o.is_test=FALSE GROUP BY o.id ORDER BY o.created_at DESC LIMIT 100`, [response.locals.customer.sub]); response.json((rows as (RowDataPacket & { item_summary:string })[]).map((order) => ({ ...order, item_summary: sanitizePublicProductText(order.item_summary) }))); } catch (error) { next(error); }
});

app.post('/api/orders', publicLimiter, requireCustomer, async (request, response, next) => {
  try {
    const input = orderSchema.parse(request.body);
    const orderReference = reference();
    if (!pool) return response.status(503).json({ error: 'Order service unavailable' });
    if (!isYocoConfigured()) return response.status(503).json({ error: 'Secure payment is temporarily unavailable' });
    const orderId = await withTransaction(async (connection) => {
      const [customerRows] = await connection.execute('SELECT id,name,email,phone FROM customers WHERE id=? LIMIT 1 FOR UPDATE', [response.locals.customer.sub]);
      const account = (customerRows as (RowDataPacket & { id: number; name: string; email: string; phone: string | null })[])[0];
      if (!account) throw Object.assign(new Error('Your customer account could not be found. Please sign in again.'), { status: 401 });
      const ids = input.items.map((item) => item.productId);
      const placeholders = ids.map(() => '?').join(',');
      const [rows] = await connection.execute(`SELECT p.id,p.title,p.model,p.pack_size,p.selling_price,p.estimated_customer_delivery_cost,o.retailer,o.source_url,o.supplier_sku,o.current_cost,o.supplier_delivery_cost,o.stock_status,o.fulfilment_type,o.fulfilment_signal,o.last_checked_at,o.promotion_end_at,COALESCE(s.supplier_stale_hours,24) AS stale_hours,COALESCE(s.free_delivery_threshold,999) AS free_threshold,COALESCE(s.standard_customer_delivery,89) AS delivery_charge FROM products p JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1) LEFT JOIN pricing_settings s ON s.id=1 WHERE p.id IN (${placeholders}) AND p.status='published' AND p.deleted_at IS NULL AND p.gallery_image_count>=1 AND o.price_verified=TRUE FOR UPDATE`, ids);
      const productRows = rows as (RowDataPacket & { id: number; title: string; model: string; pack_size: string; selling_price: number; estimated_customer_delivery_cost: number; retailer: string; source_url: string; supplier_sku: string | null; current_cost: number; supplier_delivery_cost: number; stock_status: string; fulfilment_type: string; fulfilment_signal: string | null; last_checked_at: Date; promotion_end_at: Date | null; stale_hours: number; free_threshold: number; delivery_charge: number })[];
      if (productRows.length !== ids.length) throw Object.assign(new Error('One or more products are not available'), { status: 409 });
      const now = Date.now();
      for (const product of productRows) if (!['in_stock','low_stock'].includes(product.stock_status) || (product.promotion_end_at && new Date(product.promotion_end_at).getTime() <= now)) throw Object.assign(new Error(`${product.title} is no longer available to request`), { status: 409 });
      const revenue = input.items.reduce((sum, item) => sum + Number(productRows.find((row) => row.id === item.productId)!.selling_price) * item.quantity, 0);
      const settings = productRows[0];
      const delivery = revenue >= settings.free_threshold ? 0 : settings.delivery_charge;
      const supplierProductCost = input.items.reduce((sum, item) => sum + Number(productRows.find((row) => row.id === item.productId)!.current_cost) * item.quantity, 0);
      const supplierDelivery = input.items.reduce((sum, item) => sum + Number(productRows.find((row) => row.id === item.productId)!.supplier_delivery_cost || 0), 0);
      const customerDeliveryCost = Math.max(0, ...input.items.map((item) => Number(productRows.find((row) => row.id === item.productId)!.estimated_customer_delivery_cost || 0)));
      const expectedProfit = calculateProfit({ productRevenue: revenue, customerDeliveryCharged: delivery, supplierProductCost, supplierDelivery, customerDeliveryCost, packaging: 0, paymentFees: 0, advertisingCost: 0 });
      const customer = { ...input.customer, name: account.name, email: account.email, phone: account.phone || input.customer.phone };
      const estimates = productRows.map((product) => deliveryEstimate({ retailer: product.retailer, fulfilmentType: product.fulfilment_type, stockStatus: product.stock_status, province: customer.province }));
      const estimateMin = Math.max(...estimates.map((item) => item.totalMinDays));
      const estimateMax = Math.max(...estimates.map((item) => item.totalMaxDays));
      const supplierMax = Math.max(...estimates.map((item) => item.supplierMaxDays));
      const estimateBasis = [...new Set(productRows.map((product) => `${product.retailer}: ${deliveryEstimate({ retailer: product.retailer, fulfilmentType: product.fulfilment_type, stockStatus: product.stock_status }).fulfilmentLabel}`))].join('; ').slice(0, 500);
      const expectedShipAt = addBusinessDays(new Date(), supplierMax + 1);
      const expectedDeliveryAt = addBusinessDays(new Date(), estimateMax);
      const [result] = await connection.execute('INSERT INTO order_requests (customer_id,reference,customer_name,customer_email,customer_phone,address_line_1,suburb,city,province,postal_code,notes,is_test,product_revenue,customer_delivery_charged,supplier_product_cost,supplier_delivery,customer_delivery_cost,expected_profit,expected_ship_at,expected_delivery_at,delivery_estimate_min_days,delivery_estimate_max_days,delivery_estimate_basis) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [account.id, orderReference, customer.name, customer.email, customer.phone, customer.addressLine1, customer.suburb, customer.city, customer.province, customer.postalCode, customer.notes || null, false, revenue, delivery, supplierProductCost, supplierDelivery, customerDeliveryCost, expectedProfit, expectedShipAt, expectedDeliveryAt, estimateMin, estimateMax, estimateBasis]);
      const orderId = Number((result as { insertId: number }).insertId);
      for (const item of input.items) {
        const product = productRows.find((row) => row.id === item.productId)!;
        const itemEstimate = deliveryEstimate({ retailer: product.retailer, fulfilmentType: product.fulfilment_type, stockStatus: product.stock_status, province: customer.province });
        await connection.execute('INSERT INTO order_items (order_request_id,product_id,product_title_snapshot,model_snapshot,pack_size_snapshot,quantity,agreed_unit_price,supplier_retailer_snapshot,supplier_source_url_snapshot,supplier_sku_snapshot,supplier_unit_cost_snapshot,supplier_fulfilment_snapshot,estimated_supplier_days_min,estimated_supplier_days_max) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [orderId, product.id, product.title, product.model, product.pack_size, item.quantity, product.selling_price, product.retailer, product.source_url, product.supplier_sku, product.current_cost, itemEstimate.fulfilmentType, itemEstimate.supplierMinDays, itemEstimate.supplierMaxDays]);
        // Checkout is not payment. Keep every requested item in the account cart
        // until a verified payment webhook removes the purchased quantity.
        await connection.execute(`INSERT INTO customer_cart_items (customer_id,product_id,quantity) VALUES (?,?,?)
          ON DUPLICATE KEY UPDATE quantity=GREATEST(quantity,VALUES(quantity)),updated_at=UTC_TIMESTAMP()`, [account.id, product.id, item.quantity]);
      }
      const needsFreshSupplierCheck = productRows.some((product) => !product.last_checked_at || now - new Date(product.last_checked_at).getTime() > product.stale_hours * 3_600_000);
      await connection.execute("INSERT INTO order_status_history (order_request_id,from_status,to_status,note) VALUES (?,NULL,'requested',?)", [orderId, needsFreshSupplierCheck ? 'Order submitted for secure payment; supplier data should be rechecked before purchasing' : 'Order submitted for secure payment']);
      return orderId;
    });
    try {
      const checkout = await provisionYocoCheckout(orderId);
      try {
        await withTransaction(async (connection) => {
          await enqueueOrderEmail(connection, orderId, 'checkout_ready', { eventKey: `order:${orderId}:checkout:${checkout.checkoutId}`, paymentLink: checkout.paymentLink, paymentMode: checkout.processingMode });
          await enqueueOrderEmail(connection, orderId, 'admin_new_order', { eventKey: `order:${orderId}:admin_new_order`, paymentMode: checkout.processingMode });
        });
      } catch (emailError) { console.error('Checkout emails could not be queued', emailError); }
      response.status(201).json({ reference: orderReference, status: 'awaiting_payment', paymentLink: checkout.paymentLink, processingMode: checkout.processingMode });
    } catch (paymentError) {
      console.error('Order created but Yoco checkout creation failed', paymentError);
      try { await withTransaction((connection) => enqueueOrderEmail(connection, orderId, 'admin_new_order', { eventKey: `order:${orderId}:admin_new_order` })); }
      catch (emailError) { console.error('New-order email could not be queued', emailError); }
      response.status(201).json({ reference: orderReference, status: 'requested', paymentLink: null, paymentError: 'Your order was saved, but secure payment could not be started. Please contact support with your order reference.' });
    }
  } catch (error) { next(error); }
});

app.post('/api/admin/login', loginLimiter, async (request, response, next) => {
  try {
    const email = String(request.body?.email || '').toLowerCase();
    const password = String(request.body?.password || '');
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const [rows] = await pool.execute('SELECT id,email,password_hash,role FROM admins WHERE email=? LIMIT 1', [email]);
    const admin = (rows as (RowDataPacket & { id: number; email: string; password_hash: string; role: 'admin' | 'operator' })[])[0];
    if (!admin || !await bcrypt.compare(password, admin.password_hash)) return response.status(401).json({ error: 'Invalid email or password' });
    response.json({ token: signAdminToken({ sub: String(admin.id), email: admin.email, role: admin.role }) });
  } catch (error) { next(error); }
});

app.get('/api/admin/review-queue', requireAdmin, async (_request, response, next) => {
  try { if (!pool) return response.status(503).json({ error: 'Database not configured' }); const [rows] = await pool.execute("SELECT p.*,o.retailer,o.current_cost,o.original_displayed_price,o.promotion_end_at,o.stock_status,o.last_checked_at FROM products p LEFT JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC LIMIT 1) WHERE p.deleted_at IS NULL AND p.status IN ('pending_review','paused','unavailable') ORDER BY p.updated_at DESC LIMIT 200"); response.json(rows); } catch (error) { next(error); }
});

app.get('/api/admin/me', requireAdmin, async (_request, response, next) => {
  try {
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const [rows] = await pool.execute('SELECT id,email,name,role FROM admins WHERE id=? LIMIT 1', [response.locals.admin.sub]);
    const admin = (rows as RowDataPacket[])[0];
    if (!admin) return response.status(404).json({ error: 'Administrator not found' });
    response.json(admin);
  } catch (error) { next(error); }
});

app.patch('/api/admin/password', loginLimiter, requireAdmin, async (request, response, next) => {
  try {
    const input = adminPasswordUpdateSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const newHash = await bcrypt.hash(input.newPassword, 12);
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute('SELECT id,email,name,password_hash FROM admins WHERE id=? LIMIT 1 FOR UPDATE', [response.locals.admin.sub]);
      const admin = (rows as (RowDataPacket & { id:number; email:string; name:string; password_hash:string })[])[0];
      if (!admin) throw Object.assign(new Error('Administrator not found'), { status: 404 });
      if (!await bcrypt.compare(input.currentPassword, admin.password_hash)) throw Object.assign(new Error('Your current password is incorrect'), { status: 401 });
      await connection.execute('UPDATE admins SET password_hash=? WHERE id=?', [newHash, admin.id]);
      await enqueueAccountEmail(connection, admin, 'password_changed', `admin:${admin.id}:password_changed:${Date.now()}`);
    });
    response.status(204).end();
  } catch (error) { next(error); }
});

app.get('/api/admin/customers', requireAdmin, async (_request, response, next) => {
  try {
    if (response.locals.admin.role !== 'admin') return response.status(403).json({ error: 'Administrator access required' });
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const [rows] = await pool.execute(`SELECT c.id,c.email,c.name,c.phone,c.created_at,c.updated_at,
      COUNT(o.id) AS order_count,MAX(o.created_at) AS last_order_at
      FROM customers c LEFT JOIN order_requests o ON o.customer_id=c.id
      GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 500`);
    response.json(rows);
  } catch (error) { next(error); }
});

app.patch('/api/admin/customers/:id', requireAdmin, async (request, response, next) => {
  try {
    if (response.locals.admin.role !== 'admin') return response.status(403).json({ error: 'Administrator access required' });
    const customerId = Number(request.params.id);
    if (!Number.isInteger(customerId) || customerId < 1) return response.status(400).json({ error: 'Invalid customer identifier' });
    const input = adminCustomerUpdateSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const email = input.email.toLowerCase();
    const updated = await withTransaction(async (connection) => {
      const [rows] = await connection.execute('SELECT id FROM customers WHERE id=? FOR UPDATE', [customerId]);
      if (!(rows as RowDataPacket[]).length) throw Object.assign(new Error('Customer not found'), { status: 404 });
      const [duplicates] = await connection.execute('SELECT id FROM customers WHERE email=? AND id<>? LIMIT 1', [email, customerId]);
      if ((duplicates as RowDataPacket[]).length) throw Object.assign(new Error('Another account already uses this email address'), { status: 409 });
      if (input.newPassword) await connection.execute('UPDATE customers SET name=?,email=?,phone=?,password_hash=? WHERE id=?', [input.name, email, input.phone || null, await bcrypt.hash(input.newPassword, 12), customerId]);
      else await connection.execute('UPDATE customers SET name=?,email=?,phone=? WHERE id=?', [input.name, email, input.phone || null, customerId]);
      await enqueueAccountEmail(connection, { id: customerId, name: input.name, email }, input.newPassword ? 'password_changed' : 'profile_updated', `customer:${customerId}:${input.newPassword ? 'password_changed' : 'profile_updated'}:${Date.now()}`);
      return { id: customerId, name: input.name, email, phone: input.phone || null, passwordChanged: Boolean(input.newPassword) };
    });
    response.json(updated);
  } catch (error) { next(error); }
});

app.get('/api/admin/products', requireAdmin, async (request, response, next) => {
  try { const offset = Number(request.query.offset || 0); if (!Number.isSafeInteger(offset) || offset < 0) return response.status(400).json({ error: 'Invalid product offset' }); if (!pool) return response.status(503).json({ error: 'Database not configured' }); const [rows] = await pool.query("SELECT p.*,i.url AS image_url,o.retailer,o.source_url,o.supplier_sku,o.current_cost,o.original_displayed_price,o.supplier_delivery_cost,o.promotion_start_at,o.promotion_end_at,o.promotion_end_provided,o.promotion_terms,o.quantity_limit,o.stock_status,o.fulfilment_type,o.fulfilment_signal,o.last_checked_at,o.source_confidence,o.price_verified,o.price_updated_at,o.price_change_reason FROM products p LEFT JOIN product_images i ON i.product_id=p.id AND i.sort_order=0 LEFT JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1) WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC,p.id DESC LIMIT 5000 OFFSET ?", [offset]); response.json(await withProductImages(rows as RowDataPacket[])); } catch (error) { next(error); }
});

app.post('/api/admin/products/import-url', requireAdmin, async (request, response, next) => {
  try { const { url } = productUrlImportSchema.parse(request.body); response.json(await importProductUrl(url)); }
  catch (error) { next(error); }
});

app.post('/api/admin/products', requireAdmin, async (request, response, next) => {
  try {
    const input = adminProductCreateSchema.parse(request.body);
    if (input.status === 'published') return response.status(422).json({ error: 'Save the product for review, then use the review action to publish it' });
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const created = await withTransaction(async (connection) => {
      let duplicateRows: RowDataPacket[] = [];
      if (input.barcode) {
        const [duplicates] = await connection.execute('SELECT id FROM products WHERE barcode=? AND deleted_at IS NULL LIMIT 1', [input.barcode]); duplicateRows = duplicates as RowDataPacket[];
      } else if (input.model || input.packSize) {
        const [duplicates] = await connection.execute('SELECT id FROM products WHERE LOWER(brand)=LOWER(?) AND LOWER(model)=LOWER(?) AND LOWER(pack_size)=LOWER(?) AND deleted_at IS NULL LIMIT 1', [input.brand, input.model, input.packSize]); duplicateRows = duplicates as RowDataPacket[];
      }
      if (duplicateRows.length) throw Object.assign(new Error('An exact product with this barcode or model and pack size already exists'), { status: 409 });
      const slug = productSlug(input.title);
      const [result] = await connection.execute("INSERT INTO products (slug,title,brand,model,barcode,pack_size,category,description,specifications,selling_price,minimum_profit,estimated_customer_delivery_cost,delivery_time,item_weight_size,internal_review_notes,status,review_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?)", [slug, input.title, input.brand, input.model, input.barcode || null, input.packSize, input.category, input.description, JSON.stringify(input.specifications), input.sellingPrice, input.minimumProfit ?? null, input.estimatedCustomerDeliveryCost ?? 0, input.deliveryTime || null, input.itemWeightSize || null, input.reviewNotes || null, 'New product requires supplier verification']);
      const id = Number((result as { insertId: number }).insertId);
      await replaceProductImages(connection, id, input.title, input.imageUrls || (input.imageUrl ? [input.imageUrl] : []));
      let offerId: number | null = null;
      const supplier = input.supplier;
      if (supplier) {
        const [offerResult] = await connection.execute(`INSERT INTO supplier_offers
          (product_id,retailer,source_url,supplier_sku,brand,model,barcode,pack_size,current_cost,original_displayed_price,supplier_delivery_cost,promotion_start_at,promotion_end_at,promotion_end_provided,promotion_terms,quantity_limit,stock_status,fulfilment_type,fulfilment_signal,source_confidence,price_verified,last_checked_at,price_updated_at,price_change_reason)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, supplier.retailer || 'Not provided', supplier.sourceUrl || '', supplier.supplierSku || null, input.brand, input.model, input.barcode || null, input.packSize, supplier.currentCost ?? null, supplier.originalDisplayedPrice ?? null, supplier.supplierDeliveryCost ?? 0, supplier.promotionStartAt ?? null, supplier.promotionEndAt ?? null, Boolean(supplier.promotionEndAt || supplier.promotionEndProvided), supplier.promotionTerms || null, supplier.quantityLimit || null, supplier.stockStatus || 'unknown', supplier.fulfilmentType || 'unknown', supplier.fulfilmentSignal || null, supplier.sourceConfidence || 'low', Boolean(supplier.supplierPriceVerified), supplier.lastCheckedAt ?? null, supplier.priceUpdatedAt ?? (supplier.currentCost != null ? new Date() : null), supplier.priceChangeReason || 'Initial supplier entry']);
        offerId = Number((offerResult as { insertId: number }).insertId);
      }
      await connection.execute('INSERT INTO price_history (product_id,supplier_offer_id,supplier_cost,selling_price,reason,changed_by_admin_id) VALUES (?,?,?,?,?,?)', [id, offerId, supplier?.currentCost ?? null, input.sellingPrice, supplier?.priceChangeReason || 'Product created', response.locals.admin.sub]);
      const pricing = input.status === 'published' ? await assertProductPublishable(connection, id) : null;
      await connection.execute('UPDATE products SET status=?,review_reason=? WHERE id=?', [input.status, input.status === 'published' ? null : 'New product requires supplier verification', id]);
      return { id, slug, pricing };
    });
    response.status(201).json({ ...created, status: input.status });
  } catch (error) { next(error); }
});

app.get('/api/admin/products/:id', requireAdmin, async (request, response, next) => {
  try {
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const [rows] = await pool.execute('SELECT p.*,i.url AS image_url FROM products p LEFT JOIN product_images i ON i.product_id=p.id AND i.sort_order=0 WHERE p.id=? AND p.deleted_at IS NULL', [request.params.id]);
    const product = (rows as RowDataPacket[])[0];
    if (!product) return response.status(404).json({ error: 'Product not found' });
    const [offers] = await pool.execute('SELECT * FROM supplier_offers WHERE product_id=? ORDER BY last_checked_at DESC', [request.params.id]);
    const [images, reviews] = await Promise.all([
      pool.execute('SELECT id,url,alt_text,sort_order FROM product_images WHERE product_id=? ORDER BY sort_order,id', [request.params.id]),
      pool.execute('SELECT id,previous_status,decision,checklist,notes,created_at FROM product_reviews WHERE product_id=? ORDER BY created_at DESC LIMIT 50', [request.params.id]),
    ]);
    response.json({ ...product, images: images[0], offers, reviews: reviews[0] });
  } catch (error) { next(error); }
});

app.patch('/api/admin/products/:id', requireAdmin, async (request, response, next) => {
  try {
    const input = adminProductUpdateSchema.parse(request.body);
    if (input.status === 'published') return response.status(422).json({ error: 'Use the product review action and complete its checklist to publish' });
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.execute('SELECT title,brand,model,barcode,pack_size,selling_price,status FROM products WHERE id=? AND deleted_at IS NULL FOR UPDATE', [request.params.id]);
      const current = (rows as (RowDataPacket & { title: string; brand: string; model: string; barcode: string | null; pack_size: string; selling_price: number; status: string })[])[0];
      if (!current) throw Object.assign(new Error('Product not found'), { status: 404 });
      const columns: Record<string, string> = { title: 'title', brand: 'brand', model: 'model', barcode: 'barcode', packSize: 'pack_size', category: 'category', description: 'description', specifications: 'specifications', sellingPrice: 'selling_price', minimumProfit: 'minimum_profit', estimatedCustomerDeliveryCost: 'estimated_customer_delivery_cost', deliveryTime: 'delivery_time', itemWeightSize: 'item_weight_size', reviewNotes: 'internal_review_notes' };
      const entries = Object.entries(input).filter(([key]) => key in columns);
      if (entries.length) {
        const assignments = entries.map(([key]) => `${columns[key]}=?`).join(',');
        const values = entries.map(([key, value]) => key === 'specifications' ? JSON.stringify(value) : value);
        await connection.execute(`UPDATE products SET ${assignments} WHERE id=?`, [...values, request.params.id]);
      }
      if ('imageUrls' in input || 'imageUrl' in input) await replaceProductImages(connection, String(request.params.id), input.title || current.title, input.imageUrls || (input.imageUrl ? [input.imageUrl] : []));
      const [identityRows] = await connection.execute('SELECT title,brand,model,barcode,pack_size,selling_price FROM products WHERE id=?', [request.params.id]);
      const product = (identityRows as (RowDataPacket & { title: string; brand: string; model: string; barcode: string | null; pack_size: string; selling_price: number })[])[0];
      let offerId: number | null = null;
      let previousSupplierCost: number | null = null;
      let currentSupplierCost: number | null = null;
      const [offerRows] = await connection.execute('SELECT id,current_cost FROM supplier_offers WHERE product_id=? ORDER BY last_checked_at DESC,id DESC LIMIT 1 FOR UPDATE', [request.params.id]);
      const existing = (offerRows as (RowDataPacket & { id: number; current_cost: number | null })[])[0];
      if (existing) {
        offerId = Number(existing.id);
        previousSupplierCost = existing.current_cost == null ? null : Number(existing.current_cost);
        currentSupplierCost = previousSupplierCost;
      }
      if (input.supplier) {
        const supplier = input.supplier;
        const offerColumns: Record<string, string> = { retailer: 'retailer', sourceUrl: 'source_url', supplierSku: 'supplier_sku', currentCost: 'current_cost', originalDisplayedPrice: 'original_displayed_price', supplierDeliveryCost: 'supplier_delivery_cost', promotionStartAt: 'promotion_start_at', promotionEndAt: 'promotion_end_at', promotionEndProvided: 'promotion_end_provided', promotionTerms: 'promotion_terms', quantityLimit: 'quantity_limit', stockStatus: 'stock_status', fulfilmentType: 'fulfilment_type', fulfilmentSignal: 'fulfilment_signal', sourceConfidence: 'source_confidence', supplierPriceVerified: 'price_verified', lastCheckedAt: 'last_checked_at', priceUpdatedAt: 'price_updated_at', priceChangeReason: 'price_change_reason' };
        if (existing) {
          offerId = Number(existing.id);
          const offerEntries = Object.entries(supplier).filter(([key, value]) => key in offerColumns && value !== undefined);
          if (supplier.promotionEndAt && supplier.promotionEndProvided === undefined) offerEntries.push(['promotionEndProvided', true]);
          if (offerEntries.length) await connection.execute(`UPDATE supplier_offers SET ${offerEntries.map(([key]) => `${offerColumns[key]}=?`).join(',')},brand=?,model=?,barcode=?,pack_size=? WHERE id=?`, [...offerEntries.map(([, value]) => value), product.brand, product.model, product.barcode, product.pack_size, offerId]);
        } else {
          const [offerResult] = await connection.execute(`INSERT INTO supplier_offers
            (product_id,retailer,source_url,supplier_sku,brand,model,barcode,pack_size,current_cost,original_displayed_price,supplier_delivery_cost,promotion_start_at,promotion_end_at,promotion_end_provided,promotion_terms,quantity_limit,stock_status,fulfilment_type,fulfilment_signal,source_confidence,price_verified,last_checked_at,price_updated_at,price_change_reason)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [request.params.id, supplier.retailer || 'Not provided', supplier.sourceUrl || '', supplier.supplierSku || null, product.brand, product.model, product.barcode, product.pack_size, supplier.currentCost ?? null, supplier.originalDisplayedPrice ?? null, supplier.supplierDeliveryCost ?? 0, supplier.promotionStartAt ?? null, supplier.promotionEndAt ?? null, Boolean(supplier.promotionEndAt || supplier.promotionEndProvided), supplier.promotionTerms || null, supplier.quantityLimit || null, supplier.stockStatus || 'unknown', supplier.fulfilmentType || 'unknown', supplier.fulfilmentSignal || null, supplier.sourceConfidence || 'low', Boolean(supplier.supplierPriceVerified), supplier.lastCheckedAt ?? null, supplier.priceUpdatedAt ?? (supplier.currentCost != null ? new Date() : null), supplier.priceChangeReason || 'Supplier details added']);
          offerId = Number((offerResult as { insertId: number }).insertId);
        }
        const [costRows] = await connection.execute('SELECT current_cost FROM supplier_offers WHERE id=?', [offerId]);
        const cost = (costRows as (RowDataPacket & { current_cost: number | null })[])[0]?.current_cost;
        currentSupplierCost = cost == null ? null : Number(cost);
      }
      const sellingPriceChanged = input.sellingPrice != null && Number(current.selling_price) !== input.sellingPrice;
      const supplierPriceChanged = previousSupplierCost !== currentSupplierCost && input.supplier?.currentCost !== undefined;
      if (sellingPriceChanged || supplierPriceChanged) await connection.execute('INSERT INTO price_history (product_id,supplier_offer_id,supplier_cost,selling_price,reason,changed_by_admin_id) VALUES (?,?,?,?,?,?)', [request.params.id, offerId, currentSupplierCost, product.selling_price, input.supplier?.priceChangeReason || (supplierPriceChanged ? 'Supplier price updated' : 'Selling price updated'), response.locals.admin.sub]);
      let pricing = null;
      if (input.status === 'published') pricing = await assertProductPublishable(connection, String(request.params.id));
      const nextStatus = input.status || (current.status === 'published' && (entries.length || input.supplier || 'imageUrl' in input || 'imageUrls' in input) ? 'pending_review' : current.status);
      const reviewReason = nextStatus === 'published' ? null : input.reviewNotes || (current.status === 'published' && nextStatus === 'pending_review' ? 'Product or supplier details changed; recheck required' : undefined);
      if (reviewReason === undefined) await connection.execute('UPDATE products SET status=? WHERE id=?', [nextStatus, request.params.id]);
      else await connection.execute('UPDATE products SET status=?,review_reason=? WHERE id=?', [nextStatus, reviewReason, request.params.id]);
      return { status: nextStatus, pricing };
    });
    response.json({ updated: true, ...result });
  } catch (error) { next(error); }
});

app.delete('/api/admin/products/:id', requireAdmin, async (request, response, next) => {
  try { if (!pool) return response.status(503).json({ error: 'Database not configured' }); const [result] = await pool.execute("UPDATE products SET deleted_at=UTC_TIMESTAMP(),status='unavailable',review_reason='Archived by administrator' WHERE id=? AND deleted_at IS NULL", [request.params.id]); if ((result as { affectedRows: number }).affectedRows === 0) return response.status(404).json({ error: 'Product not found' }); response.status(204).end(); } catch (error) { next(error); }
});

app.post('/api/admin/products/:id/restore', requireAdmin, async (request, response, next) => {
  try { if (!pool) return response.status(503).json({ error: 'Database not configured' }); const [result] = await pool.execute("UPDATE products SET deleted_at=NULL,status='draft',review_reason='Restored; supplier verification required' WHERE id=? AND deleted_at IS NOT NULL", [request.params.id]); if ((result as { affectedRows: number }).affectedRows === 0) return response.status(404).json({ error: 'Archived product not found' }); response.json({ restored: true, status: 'draft' }); } catch (error) { next(error); }
});

app.get('/api/admin/products/:id/offers', requireAdmin, async (request, response, next) => {
  try { if (!pool) return response.json([]); const [rows] = await pool.execute('SELECT * FROM supplier_offers WHERE product_id=? ORDER BY last_checked_at DESC LIMIT 100', [request.params.id]); response.json(rows); } catch (error) { next(error); }
});

app.patch('/api/admin/products/:id/review', requireAdmin, async (request, response, next) => {
  try {
    const input = productReviewSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute("SELECT p.selling_price,p.status,o.id AS offer_id,o.current_cost FROM products p LEFT JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1) WHERE p.id=? AND p.deleted_at IS NULL FOR UPDATE", [request.params.id]);
      const product = (rows as (RowDataPacket & { selling_price: number; status: string; offer_id: number | null; current_cost: number | null })[])[0];
      if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
      if (Number(product.selling_price) !== input.sellingPrice) await connection.execute('INSERT INTO price_history (product_id,supplier_offer_id,supplier_cost,selling_price,reason,changed_by_admin_id) VALUES (?,?,?,?,?,?)', [request.params.id, product.offer_id, product.current_cost, input.sellingPrice, input.reviewReason || 'Admin review price change', response.locals.admin.sub]);
      await connection.execute('UPDATE products SET selling_price=? WHERE id=?', [input.sellingPrice, request.params.id]);
      if (input.status === 'published') await assertProductPublishable(connection, String(request.params.id));
      await connection.execute('UPDATE products SET status=?,review_reason=? WHERE id=?', [input.status, input.status === 'published' ? null : input.reviewReason || null, request.params.id]);
      await connection.execute('INSERT INTO product_reviews (product_id,admin_id,previous_status,decision,checklist,notes) VALUES (?,?,?,?,?,?)', [request.params.id, response.locals.admin.sub, product.status, input.status, JSON.stringify(input.checklist), input.reviewReason || null]);
    });
    response.json({ status: input.status, sellingPrice: input.sellingPrice });
  } catch (error) { next(error); }
});

app.get('/api/admin/pricing-settings', requireAdmin, async (_request, response, next) => {
  try { if (!pool) return response.json(null); const [rows] = await pool.execute('SELECT * FROM pricing_settings WHERE id=1'); response.json((rows as RowDataPacket[])[0]); } catch (error) { next(error); }
});

app.patch('/api/admin/pricing-settings', requireAdmin, async (request, response, next) => {
  try { const input = pricingSettingsSchema.parse(request.body); if (!pool) return response.status(503).json({ error: 'Database not configured' }); await pool.execute('UPDATE pricing_settings SET minimum_profit=?,minimum_margin_percent=?,standard_markup_percent=?,free_delivery_threshold=?,standard_customer_delivery=?,supplier_stale_hours=? WHERE id=1', [input.minimumProfit,input.minimumMarginPercent,input.standardMarkupPercent,input.freeDeliveryThreshold,input.standardCustomerDelivery,input.supplierStaleHours]); response.json(input); } catch (error) { next(error); }
});

app.get('/api/admin/orders', requireAdmin, async (_request, response, next) => {
  try { if (!pool) return response.status(503).json({ error: 'Database not configured' }); const [rows] = await pool.execute("SELECT o.*,COALESCE(GROUP_CONCAT(CONCAT(oi.product_title_snapshot,' × ',oi.quantity) ORDER BY oi.id SEPARATOR ', '),'No items') AS item_summary FROM order_requests o LEFT JOIN order_items oi ON oi.order_request_id=o.id GROUP BY o.id ORDER BY o.created_at DESC LIMIT 200"); response.json(rows); } catch (error) { next(error); }
});

app.get('/api/admin/analytics', requireAdmin, async (_request, response, next) => {
  try {
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const [summaryRows, dailyRows, statusRows, productRows, customerRows] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total_orders,
        SUM(status NOT IN ('cancelled','refunded')) AS active_orders,
        SUM(status IN ('paid','purchasing','shipped','delivered')) AS paid_orders,
        SUM(status='delivered') AS delivered_orders,
        SUM(status='awaiting_payment') AS awaiting_payment,
        SUM(CASE WHEN status IN ('paid','purchasing','shipped','delivered') THEN product_revenue+customer_delivery_charged ELSE 0 END) AS confirmed_revenue,
        SUM(CASE WHEN status IN ('paid','purchasing','shipped','delivered') THEN expected_profit ELSE 0 END) AS expected_profit,
        SUM(CASE WHEN status IN ('paid','purchasing','shipped','delivered') THEN COALESCE(actual_profit,expected_profit) ELSE 0 END) AS realised_profit,
        SUM(CASE WHEN status IN ('paid','purchasing','shipped','delivered') AND created_at>=DATE_FORMAT(UTC_DATE(),'%Y-%m-01') THEN product_revenue+customer_delivery_charged ELSE 0 END) AS current_month_revenue,
        SUM(CASE WHEN status IN ('paid','purchasing','shipped','delivered') AND created_at>=DATE_FORMAT(UTC_DATE(),'%Y-%m-01') THEN COALESCE(actual_profit,expected_profit) ELSE 0 END) AS current_month_profit,
        SUM(CASE WHEN status NOT IN ('delivered','cancelled','refunded') AND ((expected_delivery_at IS NOT NULL AND expected_delivery_at<UTC_TIMESTAMP()) OR (status='requested' AND created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR))) THEN 1 ELSE 0 END) AS orders_at_risk,
        SUM(CASE WHEN status='delivered' AND expected_delivery_at IS NOT NULL THEN 1 ELSE 0 END) AS delivery_sla_sample,
        SUM(CASE WHEN status='delivered' AND expected_delivery_at IS NOT NULL AND delivered_at<=expected_delivery_at THEN 1 ELSE 0 END) AS on_time_deliveries
        FROM order_requests WHERE is_test=FALSE`),
      pool.execute(`SELECT DATE(created_at) AS day,COUNT(*) AS orders,
        SUM(CASE WHEN status IN ('paid','purchasing','shipped','delivered') THEN product_revenue+customer_delivery_charged ELSE 0 END) AS revenue,
        SUM(CASE WHEN status IN ('paid','purchasing','shipped','delivered') THEN COALESCE(actual_profit,expected_profit) ELSE 0 END) AS profit
        FROM order_requests WHERE is_test=FALSE AND created_at>=DATE_SUB(UTC_DATE(),INTERVAL 29 DAY) GROUP BY DATE(created_at) ORDER BY day`),
      pool.execute("SELECT status,COUNT(*) AS count FROM order_requests WHERE is_test=FALSE GROUP BY status ORDER BY count DESC"),
      pool.execute("SELECT COUNT(*) AS total_products,SUM(status='published') AS published_products,SUM(status='pending_review') AS review_products,SUM(status='paused') AS paused_products,SUM(status='unavailable') AS unavailable_products FROM products WHERE deleted_at IS NULL"),
      pool.execute('SELECT COUNT(*) AS customers FROM customers'),
    ]);
    const summary = ((summaryRows[0] as RowDataPacket[])[0] || {}) as Record<string, unknown>;
    const products = ((productRows[0] as RowDataPacket[])[0] || {}) as Record<string, unknown>;
    const paidOrders = Number(summary.paid_orders || 0);
    const totalOrders = Number(summary.total_orders || 0);
    const confirmedRevenue = Number(summary.confirmed_revenue || 0);
    const currentMonthRevenue = Number(summary.current_month_revenue || 0);
    const currentMonthProfit = Number(summary.current_month_profit || 0);
    const daysElapsed = Math.max(1, new Date().getUTCDate());
    response.json({
      summary: { ...summary, ...products, customers: Number((customerRows[0] as RowDataPacket[])[0]?.customers || 0), average_order_value: paidOrders ? confirmedRevenue / paidOrders : 0, payment_conversion_rate: totalOrders ? paidOrders / totalOrders * 100 : 0, on_time_delivery_rate: Number(summary.delivery_sla_sample || 0) ? Number(summary.on_time_deliveries || 0) / Number(summary.delivery_sla_sample) * 100 : null },
      projection: { basis: 'Current calendar month run rate from confirmed real orders', basis_days: daysElapsed, projected_monthly_revenue: currentMonthRevenue / daysElapsed * 30, projected_monthly_profit: currentMonthProfit / daysElapsed * 30 },
      daily: dailyRows[0], statuses: statusRows[0], generatedAt: new Date().toISOString(),
    });
  } catch (error) { next(error); }
});

app.get('/api/admin/orders/:id/operations', requireAdmin, async (request, response, next) => {
  try {
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const [items, history, payments, cases] = await Promise.all([
      pool.execute(`SELECT oi.id,oi.product_title_snapshot,oi.model_snapshot,oi.pack_size_snapshot,oi.quantity,oi.agreed_unit_price,
        oi.supplier_verification_status,oi.verified_supplier_unit_cost,oi.supplier_stock_verified_at,oi.supplier_verification_notes,
        COALESCE(oi.supplier_retailer_snapshot,so.retailer) AS supplier_retailer_snapshot,
        COALESCE(oi.supplier_source_url_snapshot,so.source_url) AS supplier_source_url_snapshot,
        COALESCE(oi.supplier_sku_snapshot,so.supplier_sku) AS supplier_sku_snapshot,
        COALESCE(oi.supplier_unit_cost_snapshot,oi.supplier_checkout_unit_cost,so.current_cost) AS supplier_unit_cost_snapshot,
        oi.supplier_checkout_unit_cost,oi.supplier_fulfilment_snapshot,oi.estimated_supplier_days_min,oi.estimated_supplier_days_max
        FROM order_items oi
        LEFT JOIN supplier_offers so ON so.id=(SELECT id FROM supplier_offers WHERE product_id=oi.product_id ORDER BY last_checked_at DESC,id DESC LIMIT 1)
        WHERE oi.order_request_id=? ORDER BY oi.id`, [request.params.id]),
      pool.execute('SELECT from_status,to_status,note,created_at FROM order_status_history WHERE order_request_id=? ORDER BY created_at,id', [request.params.id]),
      pool.execute('SELECT provider,payment_link,external_reference,expected_amount_cents,currency,processing_mode,provider_payment_id,failure_reason,verification_status,verified_at,created_at FROM payment_references WHERE order_request_id=? ORDER BY created_at DESC', [request.params.id]),
      pool.execute('SELECT id,reference,case_type,status,reason_category,reason_details,evidence_urls,supplier_return_reference,supplier_return_url,return_courier_name,return_tracking_number,return_tracking_url,resolution,refund_amount,internal_notes,resolved_at,created_at,updated_at FROM order_support_cases WHERE order_request_id=? ORDER BY created_at DESC,id DESC', [request.params.id]),
    ]);
    response.json({ items: items[0], history: history[0], payments: payments[0], cases: cases[0] });
  } catch (error) { next(error); }
});

app.post('/api/admin/orders/:id/cases', requireAdmin, async (request, response, next) => {
  try {
    const input = supportCaseCreateSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const created = await withTransaction(async (connection) => {
      const [orderRows] = await connection.execute('SELECT id,reference,status,is_test FROM order_requests WHERE id=? FOR UPDATE', [request.params.id]);
      const order = (orderRows as (RowDataPacket & { id:number; reference:string; status:string; is_test:number })[])[0];
      if (!order || order.is_test) throw Object.assign(new Error('Real order not found'), { status: 404 });
      if (input.caseType === 'return' && !['shipped','delivered'].includes(order.status)) throw Object.assign(new Error('A return can be opened once the order has shipped'), { status: 409 });
      if (input.caseType === 'cancellation' && ['delivered','cancelled','refunded'].includes(order.status)) throw Object.assign(new Error('This order can no longer enter the cancellation workflow'), { status: 409 });
      const [existingRows] = await connection.execute("SELECT id FROM order_support_cases WHERE order_request_id=? AND case_type=? AND status NOT IN ('declined','resolved','closed') LIMIT 1", [order.id,input.caseType]);
      if ((existingRows as RowDataPacket[]).length) throw Object.assign(new Error(`An active ${input.caseType} case already exists for this order`), { status: 409 });
      const reference = `MM-${input.caseType === 'return' ? 'RET' : 'CAN'}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
      const [result] = await connection.execute('INSERT INTO order_support_cases (reference,order_request_id,case_type,reason_category,reason_details,evidence_urls,opened_by_admin_id) VALUES (?,?,?,?,?,?,?)', [reference,order.id,input.caseType,input.reasonCategory,input.reasonDetails,JSON.stringify(input.evidenceUrls),response.locals.admin.sub]);
      await connection.execute('INSERT INTO order_status_history (order_request_id,from_status,to_status,note,changed_by_admin_id) VALUES (?,?,?,?,?)', [order.id,order.status,order.status,`${input.caseType} case ${reference} opened`,response.locals.admin.sub]);
      await enqueueOrderEmail(connection, order.id, 'case_update', { eventKey: `order:${order.id}:case:${reference}:open`, caseReference: reference, caseStatus: 'open', caseType: input.caseType });
      return { id:Number((result as { insertId:number }).insertId), reference, status:'open' };
    });
    response.status(201).json(created);
  } catch (error) { next(error); }
});

app.patch('/api/admin/orders/:id/cases/:caseId', requireAdmin, async (request, response, next) => {
  try {
    const input = supportCaseUpdateSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const updated = await withTransaction(async (connection) => {
      const [rows] = await connection.execute('SELECT c.id,c.reference,c.case_type,o.status AS order_status,o.is_test FROM order_support_cases c JOIN order_requests o ON o.id=c.order_request_id WHERE c.id=? AND c.order_request_id=? FOR UPDATE', [request.params.caseId,request.params.id]);
      const record = (rows as (RowDataPacket & { id:number; reference:string; case_type:string; order_status:string; is_test:number })[])[0];
      if (!record || record.is_test) throw Object.assign(new Error('Support case not found'), { status: 404 });
      await connection.execute(`UPDATE order_support_cases SET status=?,supplier_return_reference=?,supplier_return_url=?,return_courier_name=?,return_tracking_number=?,return_tracking_url=?,resolution=?,refund_amount=?,internal_notes=?,resolved_at=CASE WHEN ? IN ('resolved','closed') THEN COALESCE(resolved_at,UTC_TIMESTAMP()) ELSE NULL END WHERE id=? AND order_request_id=?`, [input.status,input.supplierReturnReference || null,input.supplierReturnUrl || null,input.returnCourierName || null,input.returnTrackingNumber || null,input.returnTrackingUrl || null,input.resolution,input.refundAmount ?? null,input.internalNotes || null,input.status,record.id,request.params.id]);
      await connection.execute('INSERT INTO order_status_history (order_request_id,from_status,to_status,note,changed_by_admin_id) VALUES (?,?,?,?,?)', [request.params.id,record.order_status,record.order_status,`${record.case_type} case ${record.reference} updated to ${input.status}`,response.locals.admin.sub]);
      await enqueueOrderEmail(connection, String(request.params.id), 'case_update', { eventKey: `order:${request.params.id}:case:${record.reference}:${input.status}`, caseReference: record.reference, caseStatus: input.status, caseType: record.case_type });
      return { id:record.id, reference:record.reference, status:input.status, resolution:input.resolution };
    });
    response.json(updated);
  } catch (error) { next(error); }
});

app.patch('/api/admin/orders/:id/items/:itemId/supplier-verification', requireAdmin, async (request, response, next) => {
  try {
    const input = supplierItemVerificationSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const result = await withTransaction(async (connection) => {
      const [orderRows] = await connection.execute('SELECT status,is_test FROM order_requests WHERE id=? FOR UPDATE', [request.params.id]);
      const order = (orderRows as (RowDataPacket & { status: string; is_test: number })[])[0];
      if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
      if (order.is_test) throw Object.assign(new Error('Test orders cannot enter supplier verification'), { status: 409 });
      if (!['checking_supplier','quoted','paid'].includes(order.status)) throw Object.assign(new Error('Supplier verification is not available at this order stage'), { status: 409 });
      const [itemRows] = await connection.execute('SELECT id,product_title_snapshot FROM order_items WHERE id=? AND order_request_id=? FOR UPDATE', [request.params.itemId, request.params.id]);
      const item = (itemRows as (RowDataPacket & { id: number; product_title_snapshot: string })[])[0];
      if (!item) throw Object.assign(new Error('Order item not found'), { status: 404 });
      const verifiedCost = input.status === 'verified' ? input.verifiedSupplierUnitCost : null;
      await connection.execute('UPDATE order_items SET supplier_verification_status=?,verified_supplier_unit_cost=?,supplier_stock_verified_at=UTC_TIMESTAMP(),supplier_verification_notes=?,supplier_verified_by_admin_id=? WHERE id=?', [input.status, verifiedCost, input.notes || null, response.locals.admin.sub, item.id]);
      const [summaryRows] = await connection.execute("SELECT COUNT(*) AS total_items,SUM(supplier_verification_status='verified') AS verified_items,SUM(supplier_verification_status='unavailable') AS unavailable_items,SUM(CASE WHEN supplier_verification_status='verified' THEN verified_supplier_unit_cost*quantity ELSE 0 END) AS verified_supplier_total FROM order_items WHERE order_request_id=?", [request.params.id]);
      const summary = (summaryRows as (RowDataPacket & { total_items:number; verified_items:number; unavailable_items:number; verified_supplier_total:number })[])[0];
      await connection.execute('UPDATE order_requests SET supplier_product_cost=?,supplier_checked_at=UTC_TIMESTAMP() WHERE id=?', [Number(summary.verified_supplier_total || 0), request.params.id]);
      await connection.execute('INSERT INTO order_status_history (order_request_id,from_status,to_status,note,changed_by_admin_id) VALUES (?,?,?,?,?)', [request.params.id,order.status,order.status,`${item.product_title_snapshot}: supplier check ${input.status}`,response.locals.admin.sub]);
      return { ...summary, itemId: item.id, status: input.status, checkedAt: new Date().toISOString() };
    });
    response.json(result);
  } catch (error) { next(error); }
});

app.patch('/api/admin/orders/:id/fulfilment', requireAdmin, async (request, response, next) => {
  try {
    const input = orderFulfilmentSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const columns: Record<string,string> = { supplierOrderReference:'supplier_order_reference',supplierOrderUrl:'supplier_order_url',fulfilmentNotes:'fulfilment_notes',expectedShipAt:'expected_ship_at',expectedDeliveryAt:'expected_delivery_at',actualSupplierProductCost:'actual_supplier_product_cost',actualSupplierDelivery:'actual_supplier_delivery',actualCustomerDeliveryCost:'actual_customer_delivery_cost',actualPackagingCost:'actual_packaging_cost',actualPaymentFee:'actual_payment_fee',actualAdvertisingCost:'actual_advertising_cost' };
    const entries = Object.entries(input).filter(([key]) => key in columns);
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute('SELECT id,product_revenue,customer_delivery_charged,supplier_product_cost,supplier_delivery,customer_delivery_cost,packaging_cost,payment_fee_estimate,advertising_cost FROM order_requests WHERE id=? AND is_test=FALSE FOR UPDATE', [request.params.id]);
      const order = (rows as (RowDataPacket & Record<string,unknown>)[])[0];
      if (!order) throw Object.assign(new Error('Real order not found'), { status: 404 });
      if (entries.length) await connection.execute(`UPDATE order_requests SET ${entries.map(([key]) => `${columns[key]}=?`).join(',')} WHERE id=?`, [...entries.map(([,value]) => value), request.params.id]);
      const [updatedRows] = await connection.execute('SELECT * FROM order_requests WHERE id=?', [request.params.id]);
      const updated = (updatedRows as (RowDataPacket & Record<string,unknown>)[])[0];
      const actualProfit = Number(updated.product_revenue) + Number(updated.customer_delivery_charged) - Number(updated.actual_supplier_product_cost ?? updated.supplier_product_cost ?? 0) - Number(updated.actual_supplier_delivery ?? updated.supplier_delivery ?? 0) - Number(updated.actual_customer_delivery_cost ?? updated.customer_delivery_cost ?? 0) - Number(updated.actual_packaging_cost ?? updated.packaging_cost ?? 0) - Number(updated.actual_payment_fee ?? updated.payment_fee_estimate ?? 0) - Number(updated.actual_advertising_cost ?? updated.advertising_cost ?? 0);
      await connection.execute('UPDATE order_requests SET actual_profit=? WHERE id=?', [actualProfit, request.params.id]);
    });
    response.json({ updated: true });
  } catch (error) { next(error); }
});

app.patch('/api/admin/orders/:id/status', requireAdmin, async (request, response, next) => {
  try {
    const { status, courierName, trackingNumber, trackingUrl } = orderStatusSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute('SELECT status,is_test FROM order_requests WHERE id=? FOR UPDATE', [request.params.id]);
      const record = (rows as (RowDataPacket & { status: string; is_test: number })[])[0];
      const current = record?.status;
      if (!current) throw Object.assign(new Error('Order not found'), { status: 404 });
      if (record.is_test) throw Object.assign(new Error('Test orders cannot enter the real fulfilment workflow'), { status: 409 });
      const transitions: Record<string, string[]> = { requested:['checking_supplier','cancelled'], checking_supplier:['quoted','cancelled'], quoted:['awaiting_payment','cancelled'], awaiting_payment:['cancelled'], paid:['purchasing','refunded'], purchasing:['shipped','refunded'], shipped:['delivered','refunded'], delivered:['refunded'], cancelled:[], refunded:[] };
      if (!transitions[current]?.includes(status)) throw Object.assign(new Error(`Cannot move an order from ${current} to ${status}`), { status: 409 });
      if (status === 'cancelled') {
        const [caseRows] = await connection.execute("SELECT id FROM order_support_cases WHERE order_request_id=? AND case_type='cancellation' AND status IN ('approved','resolved') LIMIT 1", [request.params.id]);
        if (!(caseRows as RowDataPacket[]).length) throw Object.assign(new Error('Open and approve a cancellation case before cancelling this order'), { status: 409 });
      }
      if (status === 'refunded') {
        const [caseRows] = await connection.execute("SELECT id FROM order_support_cases WHERE order_request_id=? AND resolution='refund' AND status IN ('approved','resolved','closed') AND refund_amount IS NOT NULL LIMIT 1", [request.params.id]);
        if (!(caseRows as RowDataPacket[]).length) throw Object.assign(new Error('Approve a refund case and record its amount before marking this order refunded'), { status: 409 });
      }
      if (current === 'paid' && status === 'purchasing') {
        const [verificationRows] = await connection.execute("SELECT COUNT(*) AS total_items,SUM(supplier_verification_status='verified') AS verified_items FROM order_items WHERE order_request_id=?", [request.params.id]);
        const verification = (verificationRows as (RowDataPacket & { total_items:number; verified_items:number })[])[0];
        if (!verification.total_items || Number(verification.verified_items) !== Number(verification.total_items)) throw Object.assign(new Error('Verify every supplier item before starting purchasing'), { status: 409 });
      }
      if (status === 'paid') throw Object.assign(new Error('Use the payment verification endpoint to mark an order paid'), { status: 409 });
      const timestampColumns: Record<string,string> = { checking_supplier:'supplier_checked_at',purchasing:'purchased_at',shipped:'shipped_at',delivered:'delivered_at',cancelled:'cancelled_at',refunded:'refunded_at' };
      if (status === 'shipped') await connection.execute('UPDATE order_requests SET status=?,courier_name=?,tracking_number=?,tracking_url=?,shipped_at=UTC_TIMESTAMP() WHERE id=?', [status, courierName!, trackingNumber!, trackingUrl || null, request.params.id]);
      else if (timestampColumns[status]) await connection.execute(`UPDATE order_requests SET status=?,${timestampColumns[status]}=UTC_TIMESTAMP() WHERE id=?`, [status, request.params.id]);
      else await connection.execute('UPDATE order_requests SET status=? WHERE id=?', [status, request.params.id]);
      await connection.execute('INSERT INTO order_status_history (order_request_id,from_status,to_status,note,changed_by_admin_id) VALUES (?,?,?,?,?)', [request.params.id,current,status,`Status changed to ${status.replaceAll('_',' ')}`,response.locals.admin.sub]);
      const emailKinds: Partial<Record<string, 'purchasing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'>> = { purchasing:'purchasing', shipped:'shipped', delivered:'delivered', cancelled:'cancelled', refunded:'refunded' };
      if (emailKinds[status]) await enqueueOrderEmail(connection, String(request.params.id), emailKinds[status], { eventKey: `order:${request.params.id}:status:${status}` });
    });
    response.json({ status });
  } catch (error) { next(error); }
});

app.patch('/api/admin/orders/:id/quote', requireAdmin, async (request, response, next) => {
  try {
    const input = quoteSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.execute('SELECT o.product_revenue,o.status,o.is_test,s.minimum_profit,s.minimum_margin_percent FROM order_requests o JOIN pricing_settings s ON s.id=1 WHERE o.id=? FOR UPDATE', [request.params.id]);
      const order = (rows as (RowDataPacket & { product_revenue: number; status: string; is_test: number; minimum_profit: number; minimum_margin_percent: number })[])[0];
      if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
      if (order.is_test) throw Object.assign(new Error('Test orders cannot be quoted for real payment'), { status: 409 });
      if (!['checking_supplier', 'quoted'].includes(order.status)) throw Object.assign(new Error('Check the supplier before quoting this order'), { status: 409 });
      const [verificationRows] = await connection.execute("SELECT COUNT(*) AS total_items,SUM(supplier_verification_status='verified') AS verified_items,SUM(supplier_verification_status='unavailable') AS unavailable_items,SUM(CASE WHEN supplier_verification_status='verified' THEN verified_supplier_unit_cost*quantity ELSE 0 END) AS verified_supplier_total FROM order_items WHERE order_request_id=?", [request.params.id]);
      const verification = (verificationRows as (RowDataPacket & { total_items:number; verified_items:number; unavailable_items:number; verified_supplier_total:number })[])[0];
      if (!verification.total_items || Number(verification.verified_items) !== Number(verification.total_items)) {
        const reason = Number(verification.unavailable_items) > 0 ? 'One or more order items are unavailable' : 'Verify every order item before confirming the quote';
        throw Object.assign(new Error(reason), { status: 409 });
      }
      const verifiedSupplierProductCost = Number(verification.verified_supplier_total || 0);
      const costs = { productRevenue: Number(order.product_revenue), customerDeliveryCharged: input.customerDeliveryCharged, supplierProductCost: verifiedSupplierProductCost, supplierDelivery: input.supplierDelivery, customerDeliveryCost: input.customerDeliveryCost, packaging: input.packagingCost, paymentFees: input.paymentFeeEstimate, advertisingCost: input.advertisingCost };
      const pricing = passesPricingRules(costs, Number(order.minimum_profit), Number(order.minimum_margin_percent));
      if (!pricing.passes) throw Object.assign(new Error('Quote does not meet configured profit rules'), { status: 422 });
      await connection.execute("UPDATE order_requests SET status='quoted',customer_delivery_charged=?,supplier_product_cost=?,supplier_delivery=?,customer_delivery_cost=?,packaging_cost=?,payment_fee_estimate=?,advertising_cost=?,expected_profit=?,quoted_at=UTC_TIMESTAMP() WHERE id=?", [input.customerDeliveryCharged, verifiedSupplierProductCost, input.supplierDelivery, input.customerDeliveryCost, input.packagingCost, input.paymentFeeEstimate, input.advertisingCost, pricing.profit, request.params.id]);
      if (order.status !== 'quoted') await connection.execute("INSERT INTO order_status_history (order_request_id,from_status,to_status,note,changed_by_admin_id) VALUES (?,?,'quoted','Verified quote confirmed',?)", [request.params.id,order.status,response.locals.admin.sub]);
      return { profit: pricing.profit, margin: pricing.margin, status: 'quoted' };
    });
    if (!isYocoConfigured()) return response.json({ ...result, payment: { configured: false, status: 'quoted' } });
    try {
      const checkout = await provisionYocoCheckout(String(request.params.id));
      try { await withTransaction((connection) => enqueueOrderEmail(connection, String(request.params.id), 'checkout_ready', { eventKey: `order:${request.params.id}:checkout:${checkout.checkoutId}`, paymentLink: checkout.paymentLink, paymentMode: checkout.processingMode })); }
      catch (emailError) { console.error('Quote payment email could not be queued', emailError); }
      response.json({ ...result, status: 'awaiting_payment', payment: { configured: true, ...checkout } });
    } catch (paymentError) {
      console.error('Quote saved but Yoco checkout creation failed', paymentError);
      response.json({ ...result, payment: { configured: true, status: 'quoted', error: 'The quote was saved, but Yoco checkout creation failed. Retry from order operations.' } });
    }
  } catch (error) { next(error); }
});

app.post('/api/admin/orders/:id/yoco-checkout', requireAdmin, async (request, response, next) => {
  try {
    const checkout = await provisionYocoCheckout(String(request.params.id));
    try { await withTransaction((connection) => enqueueOrderEmail(connection, String(request.params.id), 'checkout_ready', { eventKey: `order:${request.params.id}:checkout:${checkout.checkoutId}`, paymentLink: checkout.paymentLink, paymentMode: checkout.processingMode })); }
    catch (emailError) { console.error('Yoco checkout email could not be queued', emailError); }
    response.status(checkout.reused ? 200 : 201).json({ status: 'awaiting_payment', ...checkout });
  } catch (error) { next(error); }
});

app.post('/api/admin/orders/:id/payment-link', requireAdmin, async (request, response, next) => {
  try {
    const input = paymentLinkSchema.parse(request.body);
    if (input.provider === 'yoco') return response.status(400).json({ error: 'Use the secure Yoco checkout action so webhook verification remains active.' });
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute("SELECT status,is_test FROM order_requests WHERE id=? FOR UPDATE", [request.params.id]);
      const order = (rows as (RowDataPacket & { status: string; is_test: number })[])[0];
      if (order?.is_test) throw Object.assign(new Error('Test orders cannot receive real payment links'), { status: 409 });
      if (!order || order.status !== 'quoted') throw Object.assign(new Error('Only quoted orders can receive a payment link'), { status: 409 });
      await connection.execute('INSERT INTO payment_references (order_request_id,provider,payment_link,external_reference) VALUES (?,?,?,?)', [request.params.id, input.provider, input.paymentLink, input.externalReference]);
      await connection.execute("UPDATE order_requests SET status='awaiting_payment' WHERE id=?", [request.params.id]);
      await connection.execute("INSERT INTO order_status_history (order_request_id,from_status,to_status,note,changed_by_admin_id) VALUES (?,'quoted','awaiting_payment','Payment link created',?)", [request.params.id,response.locals.admin.sub]);
    });
    response.status(201).json({ status: 'awaiting_payment' });
  } catch (error) { next(error); }
});

app.patch('/api/admin/orders/:id/confirm-payment', requireAdmin, async (request, response, next) => {
  try {
    const { externalReference } = paymentConfirmationSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    await withTransaction(async (connection) => {
      const [result] = await connection.execute("UPDATE payment_references pr JOIN order_requests o ON o.id=pr.order_request_id SET pr.verification_status='verified',pr.verified_at=UTC_TIMESTAMP(),o.status='paid' WHERE o.id=? AND pr.external_reference=? AND pr.provider<>'yoco' AND o.status='awaiting_payment' AND o.is_test=FALSE", [request.params.id, externalReference]);
      if ((result as { affectedRows: number }).affectedRows === 0) throw Object.assign(new Error('Payment reference could not be verified for this order'), { status: 409 });
      await connection.execute("INSERT INTO order_status_history (order_request_id,from_status,to_status,note,changed_by_admin_id) VALUES (?,'awaiting_payment','paid','Payment reference verified',?)", [request.params.id,response.locals.admin.sub]);
      await removePurchasedCartItems(connection, String(request.params.id));
      await enqueueOrderEmail(connection, String(request.params.id), 'payment_confirmed', { eventKey: `order:${request.params.id}:manual_payment:${externalReference}` });
    });
    response.json({ status: 'paid' });
  } catch (error) { next(error); }
});

app.get('/api/admin/emails', requireAdmin, async (_request, response, next) => {
  try {
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const [messages, summaryRows] = await Promise.all([
      pool.execute("SELECT id,message_type,recipient_email,recipient_name,subject,status,attempts,available_at,sent_at,last_error,created_at,updated_at FROM email_outbox ORDER BY id DESC LIMIT 100"),
      pool.execute("SELECT status,COUNT(*) AS count FROM email_outbox GROUP BY status"),
    ]);
    const summary = Object.fromEntries((summaryRows[0] as (RowDataPacket & { status:string; count:number })[]).map((row) => [row.status, Number(row.count)]));
    response.json({ summary: { pending:0, processing:0, sent:0, failed:0, ...summary }, messages: messages[0] });
  } catch (error) { next(error); }
});

app.post('/api/admin/emails/:id/retry', requireAdmin, async (request, response, next) => {
  try {
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id < 1) return response.status(400).json({ error: 'Invalid email identifier' });
    const [result] = await pool.execute("UPDATE email_outbox SET status='pending',attempts=0,available_at=UTC_TIMESTAMP(),locked_at=NULL,last_error=NULL WHERE id=? AND status='failed'", [id]);
    if ((result as { affectedRows:number }).affectedRows === 0) return response.status(409).json({ error: 'Only failed email deliveries can be retried' });
    response.json({ queued: true });
  } catch (error) { next(error); }
});

app.post('/api/admin/emails/test', requireAdmin, async (_request, response, next) => {
  try {
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute('SELECT id,email,name FROM admins WHERE id=? LIMIT 1', [response.locals.admin.sub]);
      const admin = (rows as (RowDataPacket & { id:number; email:string; name:string })[])[0];
      if (!admin) throw Object.assign(new Error('Administrator not found'), { status: 404 });
      await enqueueAccountEmail(connection, { ...admin, email: process.env.EMAIL_ADMIN || 'info@mzansimegastore.co.za' }, 'test', `admin:${admin.id}:email_test:${Date.now()}`);
    });
    response.status(201).json({ queued: true, recipient: process.env.EMAIL_ADMIN || 'info@mzansimegastore.co.za' });
  } catch (error) { next(error); }
});

app.use('/api', (_request, response) => response.status(404).json({ error: 'Not found' }));
app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  void _next;
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : error && typeof error === 'object' && 'issues' in error ? 400 : 500;
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  if (status >= 500) console.error(error);
  response.status(status).json({ error: status >= 500 ? 'Unexpected server error' : message });
});

export default app;
