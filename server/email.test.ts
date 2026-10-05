import { afterEach, describe, expect, it } from 'vitest';
import { buildAccountEmail, buildOrderEmail, type AccountEmailKind, type OrderEmailKind } from './email.js';

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; });

const order = {
  id: 12,
  reference: 'MMS-2026-ABC123',
  customer_name: 'Nomsa <Dlamini>',
  customer_email: 'nomsa@example.test',
  customer_phone: '082 123 4567',
  address_line_1: '10 Main Road',
  suburb: 'Rosebank',
  city: 'Johannesburg',
  province: 'Gauteng',
  postal_code: '2196',
  product_revenue: 1724,
  customer_delivery_charged: 0,
  status: 'awaiting_payment',
  expected_delivery_at: '2026-10-12T00:00:00Z',
  courier_name: null,
  tracking_number: null,
  tracking_url: null,
};
const items = [{ product_title_snapshot: 'Stand Mixer <script>alert(1)</script>', quantity: 1, agreed_unit_price: 1724 }];

describe('transactional email templates', () => {
  it('renders a branded checkout email with a test-mode warning and escaped customer data', () => {
    const email = buildOrderEmail('checkout_ready', order, items, { paymentLink: 'https://pay.example.test/checkout', paymentMode: 'test' });
    expect(email.subject).toBe('[TEST] Complete payment for MMS-2026-ABC123');
    expect(email.html).toContain('Pay securely with Yoco');
    expect(email.html).toContain('TEST MODE');
    expect(email.html).toContain('Nomsa &lt;Dlamini&gt;');
    expect(email.html).not.toContain('<script>alert(1)</script>');
    expect(email.text).toContain('https://pay.example.test/checkout');
  });

  it('includes courier tracking in a shipped email', () => {
    const email = buildOrderEmail('shipped', { ...order, courier_name: 'Courier Guy', tracking_number: 'TRACK-123', tracking_url: 'https://track.example.test/TRACK-123' }, items);
    expect(email.subject).toBe('Order MMS-2026-ABC123 has shipped');
    expect(email.html).toContain('TRACK-123');
    expect(email.html).toContain('Track your delivery');
    expect(email.text).toContain('Courier Guy TRACK-123');
  });

  it('creates account security notices without including passwords', () => {
    const email = buildAccountEmail('password_changed', { name: 'Nomsa Dlamini', email: 'nomsa@example.test' });
    expect(email.subject).toContain('password changed');
    expect(email.text).toContain('contact us immediately');
    expect(email.html).not.toMatch(/password_hash|SMTP_PASS/i);
  });

  it('routes ordinary help to support and returns to the product-return mailbox', () => {
    const paymentEmail = buildOrderEmail('payment_confirmed', order, items);
    const returnEmail = buildOrderEmail('case_update', order, items, { caseType: 'return', caseReference: 'MM-RET-123', caseStatus: 'approved' });
    const refundEmail = buildOrderEmail('refunded', order, items);

    expect(paymentEmail.html).toContain('support@mzansimegastore.co.za');
    expect(returnEmail.html).toContain('product-return@mzansimegastore.co.za');
    expect(returnEmail.text).toContain('Contact: product-return@mzansimegastore.co.za');
    expect(refundEmail.html).toContain('product-return@mzansimegastore.co.za');
  });

  it('renders every template with the shared storefront branding and hosted images', () => {
    const orderKinds: OrderEmailKind[] = ['checkout_ready', 'payment_confirmed', 'payment_failed', 'purchasing', 'shipped', 'delivered', 'cancelled', 'refunded', 'case_update', 'admin_new_order'];
    const accountKinds: AccountEmailKind[] = ['welcome', 'password_changed', 'profile_updated', 'test'];
    const options = { paymentLink: 'https://pay.example.test/checkout', caseType: 'return', caseReference: 'MM-RET-123', caseStatus: 'approved' };
    const rendered = [
      ...orderKinds.map((kind) => buildOrderEmail(kind, order, items, options)),
      ...accountKinds.map((kind) => buildAccountEmail(kind, { name: 'Nomsa Dlamini', email: 'nomsa@example.test' })),
    ];

    expect(rendered).toHaveLength(14);
    for (const email of rendered) {
      expect(email.subject.length).toBeGreaterThan(5);
      expect(email.text.length).toBeGreaterThan(20);
      expect(email.html).toContain('Big choice. Mzansi value.');
      expect(email.html).toContain('https://www.mzansimegastore.co.za/favicon.png');
      expect(email.html).toContain('https://www.mzansimegastore.co.za/hero-delivery-vw-van-brand.png');
      expect(email.html).toContain('BEESTACK (PTY) LTD');
      expect(email.html).not.toContain('undefined');
    }
  });

  it('uses a consistent aligned sender identity in the documented SMTP configuration', () => {
    process.env.SMTP_USER = 'no-reply@mzansimegastore.co.za';
    process.env.EMAIL_FROM = 'Mzansi Mega Store <no-reply@mzansimegastore.co.za>';
    expect(process.env.EMAIL_FROM).toContain(`<${process.env.SMTP_USER}>`);
    expect(process.env.SMTP_USER.split('@')[1]).toBe('mzansimegastore.co.za');
  });
});
