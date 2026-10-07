import nodemailer, { type Transporter } from 'nodemailer';
import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { withTransaction, pool } from './db/pool.js';

export type OrderEmailKind = 'checkout_ready' | 'payment_reminder' | 'payment_confirmed' | 'payment_failed' | 'purchasing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded' | 'case_update' | 'admin_new_order';
export type AccountEmailKind = 'welcome' | 'password_changed' | 'profile_updated' | 'verify_email' | 'password_reset' | 'test';

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
type AccountEmailOptions = { code?: string; expiresMinutes?: number };
type RenderedEmail = { subject: string; html: string; text: string };
type OutboxRow = RowDataPacket & {
  id: number; message_type: string; recipient_email: string; recipient_name: string | null; reply_to_email: string | null; subject: string;
  html_body: string; text_body: string; attempts: number;
};

const storeUrl = () => (process.env.STORE_PUBLIC_URL || 'https://www.mzansimegastore.co.za').replace(/\/$/, '');
const generalEmail = () => process.env.EMAIL_REPLY_TO || 'info@mzansimegastore.co.za';
const supportEmail = () => process.env.EMAIL_SUPPORT || 'support@mzansimegastore.co.za';
const returnsEmail = () => process.env.EMAIL_RETURNS || 'product-return@mzansimegastore.co.za';
const adminEmail = () => process.env.EMAIL_ADMIN || 'info@mzansimegastore.co.za';
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!);
const money = (value: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(value);
const date = (value: Date | string | null) => value ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'long', timeZone: 'Africa/Johannesburg' }).format(new Date(value)) : null;
const safeLink = (value: string) => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : storeUrl(); } catch { return storeUrl(); } };
export const isPaymentReminderDue = (paymentCreatedAt: Date | string, now = Date.now()) => {
  const createdAt = new Date(paymentCreatedAt).getTime();
  return Number.isFinite(createdAt) && now - createdAt >= 24 * 60 * 60 * 1000;
};

function emailFrame(title: string, intro: string, body: string, action?: { label: string; url: string }, testMode = false, contactEmail = supportEmail()) {
  const logoUrl = `${storeUrl()}/favicon.png`;
  const deliveryImageUrl = `${storeUrl()}/hero-delivery-vw-van-brand.png`;
  const warning = testMode ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px"><tr><td style="padding:13px 16px;border:1px solid #f1cf68;border-radius:10px;background:#fff7d9;color:#6b5200;font-size:13px;font-weight:700">TEST MODE · No real payment will be processed.</td></tr></table>` : '';
  const button = action ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0 10px"><tr><td bgcolor="#173e32" style="border-radius:8px"><a href="${escapeHtml(safeLink(action.url))}" style="display:inline-block;padding:14px 24px;border:1px solid #173e32;border-radius:8px;background:#173e32;color:#ffffff;font-size:15px;font-weight:700;line-height:20px;text-decoration:none">${escapeHtml(action.label)} &nbsp;→</a></td></tr></table>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;padding:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#173e32"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(intro)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f1ea"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:660px;background:#ffffff;border:1px solid #ded8cd;border-radius:16px;overflow:hidden;box-shadow:0 10px 32px rgba(23,62,50,.08)"><tr><td height="6" bgcolor="#ed6848" style="height:6px;line-height:6px;font-size:0">&nbsp;</td></tr><tr><td bgcolor="#173e32" style="padding:20px 26px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="58" valign="middle"><img src="${escapeHtml(logoUrl)}" width="48" height="48" alt="Mzansi Mega Store logo" style="display:block;width:48px;height:48px;border:0;border-radius:12px;background:#ffffff"></td><td valign="middle"><div style="color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;line-height:25px">Mzansi Mega Store</div><div style="margin-top:3px;color:#f5c7b8;font-size:11px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase">Big choice. Mzansi value.</div></td><td align="right" valign="middle" style="color:#dce7e2;font-size:11px;line-height:16px">Secure online shopping<br>across South Africa</td></tr></table></td></tr><tr><td style="padding:34px 30px 12px"><div style="margin:0 0 10px;color:#ed6848;font-size:11px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase">Mzansi Mega Store update</div>${warning}<h1 style="margin:0 0 14px;color:#173e32;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:36px;font-weight:700">${escapeHtml(title)}</h1><p style="margin:0 0 24px;color:#55645e;font-size:16px;line-height:25px">${escapeHtml(intro)}</p>${body}${button}</td></tr><tr><td style="padding:22px 30px 8px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e6e1d8;border-bottom:1px solid #e6e1d8"><tr><td width="33%" align="center" style="padding:18px 8px;color:#173e32;font-size:12px;line-height:17px"><strong style="display:block;color:#ed6848;font-size:18px">✓</strong><b>Protected checkout</b><br><span style="color:#75807b">Card details stay with Yoco</span></td><td width="34%" align="center" style="padding:18px 8px;border-left:1px solid #e6e1d8;border-right:1px solid #e6e1d8;color:#173e32;font-size:12px;line-height:17px"><strong style="display:block;color:#ed6848;font-size:18px">◆</strong><b>Nationwide delivery</b><br><span style="color:#75807b">Clear order updates</span></td><td width="33%" align="center" style="padding:18px 8px;color:#173e32;font-size:12px;line-height:17px"><strong style="display:block;color:#ed6848;font-size:18px">●</strong><b>Local support</b><br><span style="color:#75807b">People you can reply to</span></td></tr></table></td></tr><tr><td style="padding:18px 30px 4px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#faf7f0;border-radius:12px"><tr><td style="padding:18px 8px 18px 20px;color:#173e32"><strong style="display:block;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:23px">Mzansi on the move.</strong><span style="display:block;margin-top:5px;color:#66736e;font-size:12px;line-height:18px">Useful products delivered nationwide.</span></td><td width="220" align="right" valign="bottom"><img src="${escapeHtml(deliveryImageUrl)}" width="210" alt="Mzansi Mega Store nationwide delivery van" style="display:block;width:210px;max-width:100%;height:auto;border:0"></td></tr></table></td></tr><tr><td style="padding:22px 30px 26px"><p style="margin:0 0 12px;color:#5f6d67;font-size:13px;line-height:20px">Need help? Reply to this email or contact <a href="mailto:${escapeHtml(contactEmail)}" style="color:#173e32;font-weight:700">${escapeHtml(contactEmail)}</a>.</p><p style="margin:0 0 18px;padding:12px 14px;border-radius:8px;background:#fff4ef;color:#794737;font-size:12px;line-height:18px"><strong>Stay safe:</strong> We will never ask for your card number, CVV, PIN, OTP or banking password by email.</p><p style="margin:0;color:#7a857f;font-size:11px;line-height:18px"><a href="${escapeHtml(storeUrl())}/shop" style="color:#173e32;text-decoration:none">Shop</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${escapeHtml(storeUrl())}/account" style="color:#173e32;text-decoration:none">My account</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${escapeHtml(storeUrl())}/contact" style="color:#173e32;text-decoration:none">Contact</a><br>BEESTACK (PTY) LTD trading as Mzansi Mega Store · Reg. 2025/361006/07<br>Prices shown in ZAR and include VAT where applicable.</p></td></tr></table><p style="margin:16px 0 0;color:#8a938f;font-size:11px;line-height:16px">This is an automated service email about your Mzansi Mega Store account or order.</p></td></tr></table></body></html>`;
}

const orderSummaryHtml = (order: OrderSnapshot, items: OrderItem[]) => {
  const rows = items.map((item) => `<tr><td style="padding:11px 0;border-bottom:1px solid #e8e3da;color:#35463f;font-size:14px;line-height:20px">${escapeHtml(item.product_title_snapshot)} <span style="color:#7a857f">× ${item.quantity}</span></td><td align="right" valign="top" style="padding:11px 0 11px 14px;border-bottom:1px solid #e8e3da;color:#173e32;font-size:14px;font-weight:700;white-space:nowrap">${escapeHtml(money(Number(item.agreed_unit_price) * item.quantity))}</td></tr>`).join('');
  const delivery = Number(order.customer_delivery_charged);
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 4px;border:1px solid #e3ddd2;border-radius:12px;background:#faf8f3"><tr><td style="padding:18px 20px"><div style="color:#ed6848;font-size:10px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase">Order reference</div><div style="margin-top:4px;color:#173e32;font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:700">${escapeHtml(order.reference)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px">${rows}<tr><td style="padding-top:12px;color:#5e6c66;font-size:13px">Delivery</td><td align="right" style="padding-top:12px;color:#173e32;font-size:13px;font-weight:700">${delivery ? escapeHtml(money(delivery)) : 'Free'}</td></tr><tr><td style="padding-top:10px;color:#173e32;font-size:16px;font-weight:800">Total</td><td align="right" style="padding-top:10px;color:#ed6848;font-size:18px;font-weight:800">${escapeHtml(money(Number(order.product_revenue) + delivery))}</td></tr></table></td></tr></table>`;
};

const orderSummaryText = (order: OrderSnapshot, items: OrderItem[]) => [
  `Order reference: ${order.reference}`,
  ...items.map((item) => `${item.product_title_snapshot} × ${item.quantity} — ${money(Number(item.agreed_unit_price) * item.quantity)}`),
  `Delivery: ${Number(order.customer_delivery_charged) ? money(Number(order.customer_delivery_charged)) : 'Free'}`,
  `Total: ${money(Number(order.product_revenue) + Number(order.customer_delivery_charged))}`,
].join('\n');

export function buildOrderEmail(kind: OrderEmailKind, order: OrderSnapshot, items: OrderItem[], options: OrderEmailOptions = {}): RenderedEmail {
  const isTest = options.paymentMode === 'test';
  const summaryHtml = orderSummaryHtml(order, items);
  const summaryText = orderSummaryText(order, items);
  const accountUrl = `${storeUrl()}/orders`;
  const deliveryDate = date(order.expected_delivery_at);
  const common = { html: summaryHtml, text: summaryText };

  if (kind === 'checkout_ready') {
    const title = 'Your order is ready for secure payment';
    const intro = `Hi ${order.customer_name}, we created order ${order.reference}. Complete payment securely with Yoco to confirm it.`;
    const action = options.paymentLink ? { label: 'Pay securely with Yoco', url: options.paymentLink } : { label: 'View your order', url: accountUrl };
    return { subject: `Complete payment for ${order.reference}`, html: emailFrame(title, intro, summaryHtml, action, isTest), text: `${title}\n\n${intro}\n\n${summaryText}\n\n${action.label}: ${action.url}\n\nSupport: ${supportEmail()}` };
  }
  if (kind === 'payment_reminder') {
    const title = 'Your order is still awaiting payment';
    const intro = `Hi ${order.customer_name}, order ${order.reference} has been waiting for payment for 24 hours. If you would still like these items, you can complete payment securely with Yoco.`;
    const action = options.paymentLink ? { label: 'Complete secure payment', url: options.paymentLink } : { label: 'View your order', url: accountUrl };
    return { subject: `Payment reminder for ${order.reference}`, html: emailFrame(title, intro, summaryHtml, action, isTest), text: `${title}\n\n${intro}\n\n${summaryText}\n\n${action.label}: ${action.url}\n\nThis is the only unpaid-payment reminder we will send for this order.\nSupport: ${supportEmail()}` };
  }
  if (kind === 'payment_confirmed') {
    const title = 'Payment confirmed';
    const intro = `Thank you, ${order.customer_name}. Yoco confirmed your payment for order ${order.reference}. We are now preparing your order and will keep you updated.`;
    const eta = deliveryDate ? `<p style="margin:18px 0 0"><strong>Estimated delivery:</strong> ${escapeHtml(deliveryDate)}</p>` : '';
    return { subject: `Payment confirmed for ${order.reference}`, html: emailFrame(title, intro, `${summaryHtml}${eta}`, { label: 'View order status', url: accountUrl }, isTest), text: `${title}\n\n${intro}\n\n${summaryText}${deliveryDate ? `\nEstimated delivery: ${deliveryDate}` : ''}\n\nView order: ${accountUrl}` };
  }
  if (kind === 'payment_failed') {
    const title = 'Payment did not complete';
    const intro = `Your Yoco payment for order ${order.reference} was not successful. We have not marked the order as paid.`;
    return { subject: `Payment unsuccessful for ${order.reference}`, html: emailFrame(title, intro, summaryHtml, { label: 'View order status', url: accountUrl }, isTest), text: `${title}\n\n${intro}\n\n${summaryText}\n\nView order: ${accountUrl}` };
  }
  if (kind === 'purchasing') {
    const title = 'We are preparing your order';
    const intro = `Your order items are confirmed and order ${order.reference} is now being prepared for delivery.`;
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
    const contactEmail = refunded ? returnsEmail() : supportEmail();
    const title = refunded ? 'Your refund has been recorded' : 'Your order has been cancelled';
    const intro = refunded ? `A refund has been recorded for order ${order.reference}. Your bank or payment provider may need additional processing time.` : `Order ${order.reference} has been cancelled. If a verified payment was collected, we will handle it according to the confirmed resolution.`;
    return { subject: `${refunded ? 'Refund update' : 'Order cancelled'} — ${order.reference}`, html: emailFrame(title, intro, summaryHtml, { label: 'View order status', url: accountUrl }, false, contactEmail), text: `${title}\n\n${intro}\n\n${summaryText}\n\nView order: ${accountUrl}\nContact: ${contactEmail}` };
  }
  if (kind === 'case_update') {
    const contactEmail = options.caseType === 'return' ? returnsEmail() : supportEmail();
    const caseLabel = `${options.caseType || 'support'} case ${options.caseReference || ''}`.trim();
    const title = 'Your support case was updated';
    const intro = `${caseLabel} for order ${order.reference} is now ${String(options.caseStatus || 'updated').replaceAll('_', ' ')}.`;
    return { subject: `Support update for ${order.reference}`, html: emailFrame(title, intro, summaryHtml, { label: 'View order status', url: accountUrl }, false, contactEmail), text: `${title}\n\n${intro}\n\n${summaryText}\n\nView order: ${accountUrl}\nContact: ${contactEmail}` };
  }

  const title = `New order ${order.reference}`;
  const intro = `${order.customer_name} created an order awaiting Yoco payment.`;
  const address = `<p style="margin:18px 0 0"><strong>Customer:</strong> ${escapeHtml(order.customer_name)} · ${escapeHtml(order.customer_email)} · ${escapeHtml(order.customer_phone)}<br><strong>Delivery:</strong> ${escapeHtml([order.address_line_1, order.suburb, order.city, order.province, order.postal_code].join(', '))}</p>`;
  return { subject: `New store order ${order.reference}`, html: emailFrame(title, intro, `${summaryHtml}${address}`, { label: 'Open operations dashboard', url: `${storeUrl()}/admin` }, isTest, generalEmail()), text: `${title}\n\n${intro}\n\n${common.text}\n\nCustomer: ${order.customer_name}, ${order.customer_email}, ${order.customer_phone}\nDelivery: ${[order.address_line_1, order.suburb, order.city, order.province, order.postal_code].join(', ')}\n\nAdmin: ${storeUrl()}/admin` };
}

export function buildAccountEmail(kind: AccountEmailKind, customer: { name: string; email: string }, options: AccountEmailOptions = {}): RenderedEmail {
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
  if (kind === 'verify_email' || kind === 'password_reset') {
    if (!options.code || !/^\d{6}$/.test(options.code)) throw new Error(`A six-digit code is required for ${kind}`);
    const expiresMinutes = options.expiresMinutes || 10;
    const isVerification = kind === 'verify_email';
    const title = isVerification ? 'Confirm your email address' : 'Reset your password';
    const intro = isVerification
      ? `Hi ${customer.name}, enter this code to finish creating your Mzansi Mega Store account.`
      : `Hi ${customer.name}, enter this code to choose a new password for your Mzansi Mega Store account.`;
    const code = escapeHtml(options.code);
    const body = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0 22px"><tr><td align="center" style="padding:22px;border:1px solid #ded8cd;border-radius:12px;background:#faf7f0"><div style="color:#6a7771;font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase">Your secure code</div><div style="margin-top:8px;color:#173e32;font-family:Arial,Helvetica,sans-serif;font-size:34px;font-weight:800;letter-spacing:8px;line-height:42px">${code}</div><div style="margin-top:8px;color:#75807b;font-size:12px;line-height:18px">Expires in ${expiresMinutes} minutes · Can only be used once</div></td></tr></table><p style="margin:0 0 18px;color:#5f6d67;font-size:13px;line-height:20px">If you did not request this code, you can safely ignore this email. Do not share the code with anyone.</p>`;
    const subject = isVerification ? 'Confirm your Mzansi Mega Store email' : 'Reset your Mzansi Mega Store password';
    return { subject, html: emailFrame(title, intro, body), text: `${title}\n\n${intro}\n\nYour secure code: ${options.code}\nThis code expires in ${expiresMinutes} minutes and can only be used once.\n\nIf you did not request this code, ignore this email. Do not share it with anyone.` };
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

async function insertOutbox(connection: PoolConnection, input: { eventKey: string; messageType: string; email: string; name?: string | null; replyToEmail: string; rendered: RenderedEmail }) {
  await connection.execute(`INSERT INTO email_outbox (event_key,message_type,recipient_email,recipient_name,reply_to_email,subject,html_body,text_body)
    VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE reply_to_email=VALUES(reply_to_email)`, [input.eventKey, input.messageType, input.email.toLowerCase(), input.name || null, input.replyToEmail.toLowerCase(), input.rendered.subject, input.rendered.html, input.rendered.text]);
}

export async function enqueueOrderEmail(connection: PoolConnection, orderId: string | number, kind: OrderEmailKind, options: OrderEmailOptions = {}) {
  const [orderRows] = await connection.execute('SELECT id,reference,customer_name,customer_email,customer_phone,address_line_1,suburb,city,province,postal_code,product_revenue,customer_delivery_charged,status,expected_delivery_at,courier_name,tracking_number,tracking_url FROM order_requests WHERE id=? LIMIT 1', [orderId]);
  const order = (orderRows as OrderSnapshot[])[0];
  if (!order) throw new Error(`Cannot queue email for missing order ${orderId}`);
  const [itemRows] = await connection.execute('SELECT product_title_snapshot,quantity,agreed_unit_price FROM order_items WHERE order_request_id=? ORDER BY id', [orderId]);
  const items = itemRows as OrderItem[];
  const rendered = buildOrderEmail(kind, order, items, options);
  const recipient = kind === 'admin_new_order' ? { email: adminEmail(), name: 'Mzansi Mega Store operations' } : { email: order.customer_email, name: order.customer_name };
  const replyToEmail = kind === 'admin_new_order' ? generalEmail() : kind === 'refunded' || (kind === 'case_update' && options.caseType === 'return') ? returnsEmail() : supportEmail();
  await insertOutbox(connection, { eventKey: options.eventKey || `order:${order.id}:${kind}`, messageType: `order_${kind}`, ...recipient, replyToEmail, rendered });
}

export async function enqueueAccountEmail(connection: PoolConnection, customer: { id: number | string; name: string; email: string }, kind: AccountEmailKind, eventKey?: string, options: AccountEmailOptions = {}) {
  await insertOutbox(connection, { eventKey: eventKey || `customer:${customer.id}:${kind}`, messageType: `account_${kind}`, email: customer.email, name: customer.name, replyToEmail: supportEmail(), rendered: buildAccountEmail(kind, customer, options) });
}

export async function queueConfiguredEmailTest() {
  const recipient = process.env.EMAIL_TEST_RECIPIENT?.trim().toLowerCase();
  if (!pool || !recipient) return { queued: false, recipient: null };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error('EMAIL_TEST_RECIPIENT is not a valid email address');
  await withTransaction(async (connection) => {
    await insertOutbox(connection, {
      eventKey: `system:branded_email_test:v4:${recipient}`,
      messageType: 'account_test',
      email: recipient,
      name: 'Mzansi Mega Store test recipient',
      replyToEmail: supportEmail(),
      rendered: buildAccountEmail('test', { name: 'Mzansi Mega Store test recipient', email: recipient }),
    });
  });
  return { queued: true, recipient };
}

export async function backfillTransactionalEmails() {
  if (!pool) return { queued: 0 };
  const [rows] = await pool.execute(`SELECT o.id,o.status,o.created_at,pr.created_at AS payment_created_at,pr.external_reference,pr.payment_link,pr.processing_mode,pr.verification_status
    FROM order_requests o LEFT JOIN payment_references pr ON pr.id=(SELECT id FROM payment_references WHERE order_request_id=o.id ORDER BY id DESC LIMIT 1)
    WHERE o.is_test=FALSE AND o.created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY)
    ORDER BY o.id`);
  let queued = 0;
  for (const row of rows as (RowDataPacket & { id:number; status:string; created_at:Date; payment_created_at:Date | null; external_reference:string | null; payment_link:string | null; processing_mode:string | null; verification_status:string | null })[]) {
    await withTransaction(async (connection) => {
      if (row.status === 'awaiting_payment' && row.payment_link && row.external_reference && row.verification_status === 'unverified') {
        const reminderDue = isPaymentReminderDue(row.payment_created_at || row.created_at);
        const kind: OrderEmailKind = reminderDue ? 'payment_reminder' : 'checkout_ready';
        const eventKey = reminderDue ? `order:${row.id}:payment_reminder:24h` : `order:${row.id}:checkout:${row.external_reference}`;
        await enqueueOrderEmail(connection, row.id, kind, { eventKey, paymentLink: row.payment_link, paymentMode: row.processing_mode });
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

type GoogleDnsResponse = { Status?: number; Answer?: { data: string; type: number }[] };

async function resolveGoogleDns(name: string, type: 'TXT' | 'MX' | 'A') {
  const response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { accept: 'application/dns-json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`DNS lookup for ${name} returned HTTP ${response.status}`);
  const result = await response.json() as GoogleDnsResponse;
  if (result.Status !== 0 && result.Status !== 3) throw new Error(`DNS lookup for ${name} returned status ${result.Status}`);
  return (result.Answer || []).map((answer) => answer.data.replace(/^"|"$/g, '').replace(/"\s+"/g, ''));
}

export async function inspectEmailAuthenticationDns() {
  const domain = String(process.env.SMTP_USER || '').split('@')[1] || 'mzansimegastore.co.za';
  const selector = process.env.DKIM_SELECTOR || 'default';
  const [rootTxt, dmarcTxt, dkimTxt, mx] = await Promise.all([
    resolveGoogleDns(domain, 'TXT'),
    resolveGoogleDns(`_dmarc.${domain}`, 'TXT'),
    resolveGoogleDns(`${selector}._domainkey.${domain}`, 'TXT'),
    resolveGoogleDns(domain, 'MX'),
  ]);
  const spfRecord = rootTxt.find((record) => record.toLowerCase().startsWith('v=spf1')) || '';
  const dmarcRecord = dmarcTxt.find((record) => record.toLowerCase().startsWith('v=dmarc1')) || '';
  const dkimRecord = dkimTxt.find((record) => record.toLowerCase().startsWith('v=dkim1')) || '';
  return {
    domain,
    spf: Boolean(spfRecord),
    spfHardFail: /(?:^|\s)-all(?:\s|$)/i.test(spfRecord),
    dmarc: Boolean(dmarcRecord),
    dmarcPolicy: dmarcRecord.match(/(?:^|;)\s*p=([^;\s]+)/i)?.[1]?.toLowerCase() || null,
    dkim: Boolean(dkimRecord) && /\bp=/i.test(dkimRecord),
    dkimSelector: selector,
    mx: mx.length > 0,
  };
}

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
    const [rows] = await connection.execute("SELECT id,message_type,recipient_email,recipient_name,reply_to_email,subject,html_body,text_body,attempts FROM email_outbox WHERE status='pending' AND available_at<=UTC_TIMESTAMP() ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED");
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
      const envelopeFrom = String(process.env.EMAIL_ENVELOPE_FROM || process.env.SMTP_USER || '').trim().toLowerCase();
      const result = await mailTransport().sendMail({
        from: process.env.EMAIL_FROM || `Mzansi Mega Store <${process.env.SMTP_USER}>`,
        to: message.recipient_name ? { name: message.recipient_name, address: message.recipient_email } : message.recipient_email,
        replyTo: message.reply_to_email || (message.message_type === 'order_admin_new_order' ? generalEmail() : message.message_type === 'order_refunded' ? returnsEmail() : supportEmail()),
        envelope: { from: envelopeFrom, to: message.recipient_email },
        messageId: `<mms-${message.id}-${Date.now()}@mzansimegastore.co.za>`,
        subject: message.subject,
        html: message.html_body,
        text: message.text_body,
        headers: {
          'Auto-Submitted': 'auto-generated',
          'X-Auto-Response-Suppress': 'All',
          'X-Entity-Ref-ID': `mms-email-${message.id}`,
        },
      });
      const accepted = (result.accepted || []).map((recipient) => String(recipient).toLowerCase());
      const rejected = (result.rejected || []).map((recipient) => String(recipient).toLowerCase());
      if (!accepted.includes(message.recipient_email.toLowerCase()) || rejected.includes(message.recipient_email.toLowerCase())) {
        throw new Error(`SMTP server did not accept ${message.recipient_email}: ${result.response || 'no response provided'}`);
      }
      await pool.execute("UPDATE email_outbox SET status='sent',sent_at=UTC_TIMESTAMP(),locked_at=NULL,provider_message_id=?,last_error=NULL WHERE id=?", [String(result.messageId || '').slice(0, 255), message.id]);
      console.log(`SMTP accepted ${message.message_type} email ${message.id} for ${message.recipient_email}; envelopeFrom=${envelopeFrom}; messageId=${result.messageId}; response=${result.response || 'accepted'}`);
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
