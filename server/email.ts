import nodemailer, { type Transporter } from 'nodemailer';
import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { withTransaction, pool } from './db/pool.js';

export type OrderEmailKind = 'checkout_ready' | 'payment_confirmed' | 'payment_failed' | 'purchasing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded' | 'case_update' | 'admin_new_order';
export type AccountEmailKind = 'welcome' | 'password_changed' | 'profile_updated' | 'test';

type OrderItem = { product_title_snapshot: string; quantity: number; agreed_unit_price: number };
type OrderSnapshot = {
  id: number; reference: string; customer_name: string; customer_email: string; customer_phone: string;
  address_line_1: string; suburb: string; city: string; province: string; postal_code: string;
  product_revenue: number; customer_delivery_charged: number; status: string;
  expected_delivery_at: Date | string | null; courier_name: string | null; tracking_number: string | null; tracking_url: string | null;
};
type OrderEmailOptions = {
  eventKey?: string; paymentLink?: string | null; paymentMode?: string | null;
  caseReference?: string; caseStatus?: string; caseType?: string;
};
type RenderedEmail = { subject: string; html: string; text: string };
type OutboxRow = RowDataPacket & {
  id: number; recipient_email: string; recipient_name: string | null; subject: string;
  html_body: string; text_body: string; attempts: number;
};

const storeUrl = () => (process.env.STORE_PUBLIC_URL || 'https://www.mzansimegastore.co.za').replace(/\/$/, '');
const supportEmail = () => process.env.EMAIL_REPLY_TO || 'info@mzansimegastore.co.za';
const adminEmail = () => process.env.EMAIL_ADMIN || 'info@mzansimegastore.co.za';
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!);
const money = (value: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(value);
const date = (value: Date | string | null) => value ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'long', timeZone: 'Africa/Johannesburg' }).format(new Date(value)) : null;
const safeLink = (value: string) => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : storeUrl(); } catch { return storeUrl(); } };

function emailFrame(title: string, intro: string, body: string, action?: { label: string; url: string }, testMode = false) {
  const warning = testMode ? `<div style="margin:0 0 20px;padding:12px 16px;border-radius:8px;background:#fff3cd;color:#6b5200;font-weight:700">TEST MODE — no real payment will be processed.</div>` : '';
  const button = action ? `<p style="margin:26px 0"><a href="${escapeHtml(safeLink(action.url))}" style="display:inline-block;padding:13px 22px;border-radius:7px;background:#123d2d;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(action.label)}</a></p>` : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:Arial,sans-serif;color:#17251f"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ea;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #ded9cf"><tr><td style="padding:22px 28px;background:#123d2d;color:#fff"><strong style="font-size:22px">Mzansi Mega Store</strong><div style="font-size:12px;opacity:.82;margin-top:4px">South African online shopping</div></td></tr><tr><td style="padding:30px 28px">${warning}<h1 style="font-size:26px;line-height:1.2;margin:0 0 12px">${escapeHtml(title)}</h1><p style="font-size:16px;line-height:1.6;margin:0 0 22px;color:#46544e">${escapeHtml(intro)}</p>${body}${button}<p style="font-size:13px;line-height:1.55;color:#66716c;margin:28px 0 0">Need help? Reply to this email or contact <a href="mailto:${escapeHtml(supportEmail())}" style="color:#123d2d">${escapeHtml(supportEmail())}</a>. Never send your card number, CVV, PIN or OTP by email.</p></td></tr><tr><td style="padding:18px 28px;background:#eef1ed;color:#637069;font-size:12px">BEESTACK (PTY) LTD trading as Mzansi Mega Store · Prices in ZAR</td></tr></table></td></tr></table></body></html>`;
}

const orderSummaryHtml = (order: OrderSnapshot, items: OrderItem[]) => {
  const rows = items.map((item) => `<tr><td style="padding:9px 0;border-bottom:1px solid #e8e5df">${escapeHtml(item.product_title_snapshot)} × ${item.quantity}</td><td align="right" style="padding:9px 0;border-bottom:1px solid #e8e5df">${escapeHtml(money(Number(item.agreed_unit_price) * item.quantity))}</td></tr>`).join('');
  const delivery = Number(order.customer_delivery_charged);
  return `<div style="padding:16px;border-radius:9px;background:#f7f6f2"><div style="font-size:12px;color:#6c7771;text-transform:uppercase;letter-spacing:.08em">Order reference</div><strong style="font-size:20px">${escapeHtml(order.reference)}</strong><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;font-size:14px">${rows}<tr><td style="padding-top:12px">Delivery</td><td align="right" style="padding-top:12px">${delivery ? escapeHtml(money(delivery)) : 'Free'}</td></tr><tr><td style="padding-top:8px;font-weight:700">Total</td><td align="right" style="padding-top:8px;font-weight:700">${escapeHtml(money(Number(order.product_revenue) + delivery))}</td></tr></table></div>`;
};

const orderSummaryText = (order: OrderSnapshot, items: OrderItem[]) => [
  `Order reference: ${order.reference}`,
  ...items.map((item) => `${item.product_title_snapshot} × ${item.quantity} — ${money(Number(item.agreed_unit_price) * item.quantity)}`),
  `Delivery: ${Number(order.customer_delivery_charged) ? money(Number(order.customer_delivery_charged)) : 'Free'}`,
  `Total: ${money(Number(order.product_revenue) + Number(order.customer_delivery_charged))}`,
].join('\n');

export function buildOrderEmail(kind: OrderEmailKind, order: OrderSnapshot, items: OrderItem[], options: OrderEmailOptions = {}): RenderedEmail {
  const isTest = options.paymentMode === 'test';
  const testPrefix = isTest ? '[TEST] ' : '';
  const summaryHtml = orderSummaryHtml(order, items);
  const summaryText = orderSummaryText(order, items);
  const accountUrl = `${storeUrl()}/account`;
  const deliveryDate = date(order.expected_delivery_at);
  const common = { html: summaryHtml, text: summaryText };

  if (kind === 'checkout_ready') {
    const title = 'Your order is ready for secure payment';
    const intro = `Hi ${order.customer_name}, we created order ${order.reference}. Complete payment securely with Yoco to confirm it.`;
    const action = options.paymentLink ? { label: 'Pay securely with Yoco', url: options.paymentLink } : { label: 'View your order', url: accountUrl };
    return { subject: `${testPrefix}Complete payment for ${order.reference}`, html: emailFrame(title, intro, summaryHtml, action, isTest), text: `${title}\n\n${intro}\n\n${summaryText}\n\n${action.label}: ${action.url}\n\nSupport: ${supportEmail()}` };
  }
  if (kind === 'payment_confirmed') {
    const title = 'Payment confirmed';
    const intro = `Thank you, ${order.customer_name}. Yoco confirmed your payment for order ${order.reference}. We will verify supplier availability before purchasing your items.`;
    const eta = deliveryDate ? `<p style="margin:18px 0 0"><strong>Estimated delivery:</strong> ${escapeHtml(deliveryDate)}</p>` : '';
    return { subject: `${testPrefix}Payment confirmed for ${order.reference}`, html: emailFrame(title, intro, `${summaryHtml}${eta}`, { label: 'View order status', url: accountUrl }, isTest), text: `${title}\n\n${intro}\n\n${summaryText}${deliveryDate ? `\nEstimated delivery: ${deliveryDate}` : ''}\n\nView order: ${accountUrl}` };
  }
  if (kind === 'payment_failed') {
    const title = 'Payment did not complete';
    const intro = `Your Yoco payment for order ${order.reference} was not successful. We have not marked the order as paid.`;
    return { subject: `${testPrefix}Payment unsuccessful for ${order.reference}`, html: emailFrame(title, intro, summaryHtml, { label: 'View order status', url: accountUrl }, isTest), text: `${title}\n\n${intro}\n\n${summaryText}\n\nView order: ${accountUrl}` };
  }
  if (kind === 'purchasing') {
    const title = 'We are preparing your order';
    const intro = `Supplier availability is confirmed and we are purchasing the items for order ${order.reference}.`;
    return { subject: `Order ${order.reference} is being prepared`, html: emailFrame(title, intro, summaryHtml, { label: 'View order status', url: accountUrl }), text: `${title}\n\n${intro}\n\n${summaryText}\n\nView order: ${accountUrl}` };
  }
  if (kind === 'shipped') {
    const title = 'Your order is on the way';
    const tracking = order.tracking_number ? `<p style="margin:18px 0 0"><strong>${escapeHtml(order.courier_name || 'Courier')} tracking:</strong> ${escapeHtml(order.tracking_number)}</p>` : '';
    const intro = `Good news, ${order.customer_name}: order ${order.reference} has been handed to the courier.`;
    const action = order.tracking_url ? { label: 'Track your delivery', url: order.tracking_url } : { label: 'View order status', url: accountUrl };
    return { subject: `Order ${order.reference} has shipped`, html: emailFrame(title, intro, `${summaryHtml}${tracking}`, action), text: `${title}\n\n${intro}\n\n${summaryText}${order.tracking_number ? `\nTracking: ${order.courier_name || 'Courier'} ${order.tracking_number}` : ''}\n\n${action.label}: ${action.url}` };
  }
  if (kind === 'delivered') {
    const title = 'Your order has been delivered';
    const intro = `Order ${order.reference} is marked as delivered. We hope you enjoy your purchase.`;
    return { subject: `Order ${order.reference} delivered`, html: emailFrame(title, intro, summaryHtml, { label: 'View your orders', url: accountUrl }), text: `${title}\n\n${intro}\n\n${summaryText}\n\nView orders: ${accountUrl}` };
  }
  if (kind === 'cancelled' || kind === 'refunded') {
    const refunded = kind === 'refunded';
    const title = refunded ? 'Your refund has been recorded' : 'Your order has been cancelled';
    const intro = refunded ? `A refund has been recorded for order ${order.reference}. Your bank or payment provider may need additional processing time.` : `Order ${order.reference} has been cancelled. If a verified payment was collected, we will handle it according to the confirmed resolution.`;
    return { subject: `${refunded ? 'Refund update' : 'Order cancelled'} — ${order.reference}`, html: emailFrame(title, intro, summaryHtml, { label: 'View order status', url: accountUrl }), text: `${title}\n\n${intro}\n\n${summaryText}\n\nView order: ${accountUrl}` };
  }
  if (kind === 'case_update') {
    const caseLabel = `${options.caseType || 'support'} case ${options.caseReference || ''}`.trim();
    const title = 'Your support case was updated';
    const intro = `${caseLabel} for order ${order.reference} is now ${String(options.caseStatus || 'updated').replaceAll('_', ' ')}.`;
    return { subject: `Support update for ${order.reference}`, html: emailFrame(title, intro, summaryHtml, { label: 'View order status', url: accountUrl }), text: `${title}\n\n${intro}\n\n${summaryText}\n\nView order: ${accountUrl}` };
  }

  const title = `New order ${order.reference}`;
  const intro = `${order.customer_name} created an order awaiting Yoco payment.`;
  const address = `<p style="margin:18px 0 0"><strong>Customer:</strong> ${escapeHtml(order.customer_name)} · ${escapeHtml(order.customer_email)} · ${escapeHtml(order.customer_phone)}<br><strong>Delivery:</strong> ${escapeHtml([order.address_line_1, order.suburb, order.city, order.province, order.postal_code].join(', '))}</p>`;
  return { subject: `${testPrefix}New store order ${order.reference}`, html: emailFrame(title, intro, `${summaryHtml}${address}`, { label: 'Open operations dashboard', url: `${storeUrl()}/admin` }, isTest), text: `${title}\n\n${intro}\n\n${common.text}\n\nCustomer: ${order.customer_name}, ${order.customer_email}, ${order.customer_phone}\nDelivery: ${[order.address_line_1, order.suburb, order.city, order.province, order.postal_code].join(', ')}\n\nAdmin: ${storeUrl()}/admin` };
}

export function buildAccountEmail(kind: AccountEmailKind, customer: { name: string; email: string }): RenderedEmail {
  const accountUrl = `${storeUrl()}/account`;
  if (kind === 'test') {
    const title = 'Transactional email is working';
    const intro = `This test confirms that Mzansi Mega Store can queue and deliver email through the configured SMTP mailbox to ${customer.email}.`;
    return { subject: 'Mzansi Mega Store email test', html: emailFrame(title, intro, '', { label: 'Open operations dashboard', url: `${storeUrl()}/admin` }), text: `${title}\n\n${intro}\n\nOperations dashboard: ${storeUrl()}/admin` };
  }
  if (kind === 'welcome') {
    const title = 'Welcome to Mzansi Mega Store';
    const intro = `Hi ${customer.name}, your customer account is ready. You can now follow signed-in orders and delivery progress in one place.`;
    return { subject: 'Welcome to Mzansi Mega Store', html: emailFrame(title, intro, '', { label: 'Open your account', url: accountUrl }), text: `${title}\n\n${intro}\n\nOpen your account: ${accountUrl}` };
  }
  if (kind === 'password_changed') {
    const title = 'Your password was changed';
    const intro = `The password for ${customer.email} was changed. If you did not make this change, contact us immediately.`;
    return { subject: 'Security notice: password changed', html: emailFrame(title, intro, '', { label: 'Contact support', url: `${storeUrl()}/contact` }), text: `${title}\n\n${intro}\n\nSupport: ${supportEmail()}` };
  }
  const title = 'Your profile was updated';
  const intro = `The contact details for your Mzansi Mega Store account were updated. If you did not make this change, contact us immediately.`;
  return { subject: 'Your Mzansi Mega Store profile was updated', html: emailFrame(title, intro, '', { label: 'Review your account', url: accountUrl }), text: `${title}\n\n${intro}\n\nReview your account: ${accountUrl}` };
}

async function insertOutbox(connection: PoolConnection, input: { eventKey: string; messageType: string; email: string; name?: string | null; rendered: RenderedEmail }) {
  await connection.execute(`INSERT INTO email_outbox (event_key,message_type,recipient_email,recipient_name,subject,html_body,text_body)
    VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE event_key=VALUES(event_key)`, [input.eventKey, input.messageType, input.email.toLowerCase(), input.name || null, input.rendered.subject, input.rendered.html, input.rendered.text]);
}

export async function enqueueOrderEmail(connection: PoolConnection, orderId: string | number, kind: OrderEmailKind, options: OrderEmailOptions = {}) {
  const [orderRows] = await connection.execute('SELECT id,reference,customer_name,customer_email,customer_phone,address_line_1,suburb,city,province,postal_code,product_revenue,customer_delivery_charged,status,expected_delivery_at,courier_name,tracking_number,tracking_url FROM order_requests WHERE id=? LIMIT 1', [orderId]);
  const order = (orderRows as OrderSnapshot[])[0];
  if (!order) throw new Error(`Cannot queue email for missing order ${orderId}`);
  const [itemRows] = await connection.execute('SELECT product_title_snapshot,quantity,agreed_unit_price FROM order_items WHERE order_request_id=? ORDER BY id', [orderId]);
  const items = itemRows as OrderItem[];
  const rendered = buildOrderEmail(kind, order, items, options);
  const recipient = kind === 'admin_new_order' ? { email: adminEmail(), name: 'Mzansi Mega Store operations' } : { email: order.customer_email, name: order.customer_name };
  await insertOutbox(connection, { eventKey: options.eventKey || `order:${order.id}:${kind}`, messageType: `order_${kind}`, ...recipient, rendered });
}

export async function enqueueAccountEmail(connection: PoolConnection, customer: { id: number | string; name: string; email: string }, kind: AccountEmailKind, eventKey?: string) {
  await insertOutbox(connection, { eventKey: eventKey || `customer:${customer.id}:${kind}`, messageType: `account_${kind}`, email: customer.email, name: customer.name, rendered: buildAccountEmail(kind, customer) });
}

export async function backfillTransactionalEmails() {
  if (!pool) return { queued: 0 };
  const [rows] = await pool.execute(`SELECT o.id,o.status,o.created_at,pr.external_reference,pr.payment_link,pr.processing_mode,pr.verification_status
    FROM order_requests o LEFT JOIN payment_references pr ON pr.id=(SELECT id FROM payment_references WHERE order_request_id=o.id ORDER BY id DESC LIMIT 1)
    WHERE o.is_test=FALSE AND o.created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY)
    ORDER BY o.id`);
  let queued = 0;
  for (const row of rows as (RowDataPacket & { id:number; status:string; created_at:Date; external_reference:string | null; payment_link:string | null; processing_mode:string | null; verification_status:string | null })[]) {
    await withTransaction(async (connection) => {
      if (row.status === 'awaiting_payment' && row.payment_link && row.external_reference && row.verification_status === 'unverified') {
        await enqueueOrderEmail(connection, row.id, 'checkout_ready', { eventKey: `order:${row.id}:checkout:${row.external_reference}`, paymentLink: row.payment_link, paymentMode: row.processing_mode });
        queued += 1;
      }
      if (['paid','purchasing','shipped','delivered'].includes(row.status) && row.external_reference && row.verification_status === 'verified') {
        await enqueueOrderEmail(connection, row.id, 'payment_confirmed', { eventKey: `order:${row.id}:payment:${row.external_reference}:confirmed`, paymentMode: row.processing_mode });
        queued += 1;
      }
      if (['purchasing','shipped','delivered','cancelled','refunded'].includes(row.status)) {
        await enqueueOrderEmail(connection, row.id, row.status as 'purchasing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded', { eventKey: `order:${row.id}:status:${row.status}` });
        queued += 1;
      }
      if (Date.now() - new Date(row.created_at).getTime() <= 24 * 60 * 60 * 1000) {
        await enqueueOrderEmail(connection, row.id, 'admin_new_order', { eventKey: `order:${row.id}:admin_new_order`, paymentMode: row.processing_mode });
        queued += 1;
      }
    });
  }
  return { queued };
}

export const isEmailConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
let transporter: Transporter | null = null;
let transporterKey = '';

function mailTransport() {
  if (!isEmailConfigured()) throw new Error('SMTP is not configured');
  const key = [process.env.SMTP_HOST, process.env.SMTP_PORT, process.env.SMTP_SECURE, process.env.SMTP_USER, process.env.SMTP_PASS].join('|');
  if (!transporter || transporterKey !== key) {
    transporterKey = key;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: process.env.SMTP_SECURE !== 'false',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 15_000),
      greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 15_000),
      socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 30_000),
    });
  }
  return transporter;
}

export async function verifyEmailTransport() {
  if (!isEmailConfigured()) return { configured: false, verified: false };
  await mailTransport().verify();
  return { configured: true, verified: true };
}

async function claimEmail(): Promise<OutboxRow | null> {
  return withTransaction(async (connection) => {
    await connection.execute("UPDATE email_outbox SET status='pending',locked_at=NULL,last_error='Recovered after interrupted delivery' WHERE status='processing' AND locked_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)");
    const [rows] = await connection.execute("SELECT id,recipient_email,recipient_name,subject,html_body,text_body,attempts FROM email_outbox WHERE status='pending' AND available_at<=UTC_TIMESTAMP() ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED");
    const row = (rows as OutboxRow[])[0];
    if (!row) return null;
    await connection.execute("UPDATE email_outbox SET status='processing',attempts=attempts+1,locked_at=UTC_TIMESTAMP(),last_error=NULL WHERE id=?", [row.id]);
    return { ...row, attempts: Number(row.attempts) + 1 };
  });
}

export async function processEmailOutbox(limit = 20) {
  if (!pool || !isEmailConfigured()) return { configured: isEmailConfigured(), sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  for (let index = 0; index < limit; index += 1) {
    const message = await claimEmail();
    if (!message) break;
    try {
      const result = await mailTransport().sendMail({
        from: process.env.EMAIL_FROM || `Mzansi Mega Store <${process.env.SMTP_USER}>`,
        to: message.recipient_name ? { name: message.recipient_name, address: message.recipient_email } : message.recipient_email,
        replyTo: supportEmail(),
        subject: message.subject,
        html: message.html_body,
        text: message.text_body,
        headers: { 'X-Entity-Ref-ID': `mms-email-${message.id}` },
      });
      await pool.execute("UPDATE email_outbox SET status='sent',sent_at=UTC_TIMESTAMP(),locked_at=NULL,provider_message_id=?,last_error=NULL WHERE id=?", [String(result.messageId || '').slice(0, 255), message.id]);
      sent += 1;
    } catch (error) {
      const terminal = message.attempts >= 5;
      const delayMinutes = Math.min(60, 2 ** message.attempts);
      await pool.execute(`UPDATE email_outbox SET status=?,locked_at=NULL,last_error=?,available_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? MINUTE) WHERE id=?`, [terminal ? 'failed' : 'pending', (error instanceof Error ? error.message : String(error)).slice(0, 2000), delayMinutes, message.id]);
      failed += 1;
    }
  }
  return { configured: true, sent, failed };
}
