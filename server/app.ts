import 'dotenv/config';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { RowDataPacket } from 'mysql2';
import { calculateProfit, passesPricingRules } from '../shared/domain.js';
import { optionalCustomer, requireAdmin, requireCustomer, signAdminToken, signCustomerToken } from './auth.js';
import { pool, withTransaction } from './db/pool.js';
import { adminProductCreateSchema, adminProductUpdateSchema, customerLoginSchema, customerRegisterSchema, orderSchema, orderStatusSchema, paymentLinkSchema, pricingSettingsSchema, productReviewSchema, quoteSchema } from './validation.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL?.split(',') || ['http://localhost:5173'], methods: ['GET', 'POST', 'PATCH'] }));
app.use(express.json({ limit: '200kb' }));

const publicLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
const memoryOrders: unknown[] = [];
const reference = () => `MY-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
const productSlug = (title: string, model: string) => `${title}-${model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 170) + `-${crypto.randomBytes(3).toString('hex')}`;

app.get('/health', async (_request, response) => {
  if (!pool) return response.status(process.env.NODE_ENV === 'production' ? 503 : 200).json({ status: 'degraded', database: 'not_configured', mode: 'development_memory' });
  try { await pool.query('SELECT 1'); response.json({ status: 'ok', database: 'connected' }); }
  catch { response.status(503).json({ status: 'unhealthy', database: 'unavailable' }); }
});

app.get('/api/products', async (request, response, next) => {
  try {
    if (!pool) return response.json([]);
    const search = String(request.query.q || '');
    const category = String(request.query.category || '');
    const terms: string[] = ["p.status = 'published'", 'p.deleted_at IS NULL', "o.stock_status IN ('in_stock','low_stock')", 'o.last_checked_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL COALESCE(s.supplier_stale_hours,24) HOUR)', '(o.promotion_end_at IS NULL OR o.promotion_end_at > UTC_TIMESTAMP())'];
    const params: (string | number)[] = [];
    if (search) { terms.push('(p.title LIKE ? OR p.brand LIKE ? OR p.model LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (category) { terms.push('p.category = ?'); params.push(category); }
    const [rows] = await pool.execute(`SELECT p.id,p.slug,p.title,p.brand,p.model,p.pack_size,p.category,p.description,p.specifications,p.selling_price,i.url AS image_url FROM products p JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC LIMIT 1) LEFT JOIN product_images i ON i.product_id=p.id AND i.sort_order=0 LEFT JOIN pricing_settings s ON s.id=1 WHERE ${terms.join(' AND ')} ORDER BY p.updated_at DESC LIMIT 100`, params);
    response.json(rows);
  } catch (error) { next(error); }
});

app.post('/api/customer/register', loginLimiter, async (request, response, next) => {
  try {
    const input = customerRegisterSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const email = input.email.toLowerCase();
    const [existing] = await pool.execute('SELECT id FROM customers WHERE email=? LIMIT 1', [email]);
    if ((existing as RowDataPacket[]).length) return response.status(409).json({ error: 'An account already exists for this email' });
    const passwordHash = await bcrypt.hash(input.password, 12);
    const [result] = await pool.execute('INSERT INTO customers (email,password_hash,name,phone) VALUES (?,?,?,?)', [email, passwordHash, input.name, input.phone || null]);
    const id = Number((result as { insertId: number }).insertId);
    response.status(201).json({ token: signCustomerToken({ sub: String(id), email, role: 'customer' }), customer: { id, email, name: input.name, phone: input.phone || null } });
  } catch (error) { next(error); }
});

app.post('/api/customer/login', loginLimiter, async (request, response, next) => {
  try {
    const input = customerLoginSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const [rows] = await pool.execute('SELECT id,email,password_hash,name,phone FROM customers WHERE email=? LIMIT 1', [input.email.toLowerCase()]);
    const customer = (rows as (RowDataPacket & { id: number; email: string; password_hash: string; name: string; phone: string | null })[])[0];
    if (!customer || !await bcrypt.compare(input.password, customer.password_hash)) return response.status(401).json({ error: 'Invalid email or password' });
    response.json({ token: signCustomerToken({ sub: String(customer.id), email: customer.email, role: 'customer' }), customer: { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone } });
  } catch (error) { next(error); }
});

app.get('/api/customer/me', requireCustomer, async (_request, response, next) => {
  try { if (!pool) return response.status(503).json({ error: 'Database not configured' }); const [rows] = await pool.execute('SELECT id,email,name,phone,created_at FROM customers WHERE id=?', [response.locals.customer.sub]); const customer = (rows as RowDataPacket[])[0]; if (!customer) return response.status(404).json({ error: 'Customer not found' }); response.json(customer); } catch (error) { next(error); }
});

app.get('/api/customer/orders', requireCustomer, async (_request, response, next) => {
  try { if (!pool) return response.status(503).json({ error: 'Database not configured' }); const [rows] = await pool.execute('SELECT reference,status,product_revenue,customer_delivery_charged,expected_profit,created_at,updated_at FROM order_requests WHERE customer_id=? ORDER BY created_at DESC LIMIT 100', [response.locals.customer.sub]); response.json(rows); } catch (error) { next(error); }
});

app.post('/api/orders', publicLimiter, optionalCustomer, async (request, response, next) => {
  try {
    const input = orderSchema.parse(request.body);
    const orderReference = reference();
    if (!pool) {
      if (process.env.NODE_ENV === 'production') return response.status(503).json({ error: 'Order service unavailable' });
      memoryOrders.push({ ...input, reference: orderReference, createdAt: new Date().toISOString() });
      return response.status(201).json({ reference: orderReference, status: 'requested' });
    }
    await withTransaction(async (connection) => {
      const ids = input.items.map((item) => item.productId);
      const placeholders = ids.map(() => '?').join(',');
      const [rows] = await connection.execute(`SELECT p.id,p.title,p.model,p.pack_size,p.selling_price,o.stock_status,o.last_checked_at,o.promotion_end_at,COALESCE(s.supplier_stale_hours,24) AS stale_hours,COALESCE(s.free_delivery_threshold,999) AS free_threshold,COALESCE(s.standard_customer_delivery,89) AS delivery_charge FROM products p JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC LIMIT 1) LEFT JOIN pricing_settings s ON s.id=1 WHERE p.id IN (${placeholders}) AND p.status='published' FOR UPDATE`, ids);
      const productRows = rows as (RowDataPacket & { id: number; title: string; model: string; pack_size: string; selling_price: number; stock_status: string; last_checked_at: Date; promotion_end_at: Date | null; stale_hours: number; free_threshold: number; delivery_charge: number })[];
      if (productRows.length !== ids.length) throw Object.assign(new Error('One or more products are not available'), { status: 409 });
      const now = Date.now();
      for (const product of productRows) if (!['in_stock','low_stock'].includes(product.stock_status) || now - new Date(product.last_checked_at).getTime() > product.stale_hours * 3_600_000 || (product.promotion_end_at && new Date(product.promotion_end_at).getTime() <= now)) throw Object.assign(new Error(`${product.title} needs a fresh supplier check`), { status: 409 });
      const revenue = input.items.reduce((sum, item) => sum + Number(productRows.find((row) => row.id === item.productId)!.selling_price) * item.quantity, 0);
      const settings = productRows[0];
      const delivery = revenue >= settings.free_threshold ? 0 : settings.delivery_charge;
      const customer = input.customer;
      const [result] = await connection.execute('INSERT INTO order_requests (customer_id,reference,customer_name,customer_email,customer_phone,address_line_1,suburb,city,province,postal_code,notes,product_revenue,customer_delivery_charged) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [response.locals.customer?.sub || null, orderReference, customer.name, customer.email, customer.phone, customer.addressLine1, customer.suburb, customer.city, customer.province, customer.postalCode, customer.notes || null, revenue, delivery]);
      const orderId = Number((result as { insertId: number }).insertId);
      for (const item of input.items) {
        const product = productRows.find((row) => row.id === item.productId)!;
        await connection.execute('INSERT INTO order_items (order_request_id,product_id,product_title_snapshot,model_snapshot,pack_size_snapshot,quantity,agreed_unit_price) VALUES (?,?,?,?,?,?,?)', [orderId, product.id, product.title, product.model, product.pack_size, item.quantity, product.selling_price]);
      }
    });
    response.status(201).json({ reference: orderReference, status: 'requested' });
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
  try { if (!pool) return response.json([]); const [rows] = await pool.execute("SELECT p.*,o.retailer,o.current_cost,o.original_displayed_price,o.promotion_end_at,o.stock_status,o.last_checked_at FROM products p LEFT JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC LIMIT 1) WHERE p.deleted_at IS NULL AND p.status IN ('pending_review','paused','unavailable') ORDER BY p.updated_at DESC LIMIT 200"); response.json(rows); } catch (error) { next(error); }
});

app.get('/api/admin/products', requireAdmin, async (_request, response, next) => {
  try { if (!pool) return response.json([]); const [rows] = await pool.execute("SELECT p.*,i.url AS image_url,o.retailer,o.current_cost,o.original_displayed_price,o.promotion_end_at,o.stock_status,o.last_checked_at,o.source_url FROM products p LEFT JOIN product_images i ON i.product_id=p.id AND i.sort_order=0 LEFT JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC LIMIT 1) WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT 500"); response.json(rows); } catch (error) { next(error); }
});

app.post('/api/admin/products', requireAdmin, async (request, response, next) => {
  try {
    const input = adminProductCreateSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const created = await withTransaction(async (connection) => {
      const [duplicates] = input.barcode
        ? await connection.execute('SELECT id FROM products WHERE barcode=? AND deleted_at IS NULL LIMIT 1', [input.barcode])
        : await connection.execute('SELECT id FROM products WHERE LOWER(brand)=LOWER(?) AND LOWER(model)=LOWER(?) AND LOWER(pack_size)=LOWER(?) AND deleted_at IS NULL LIMIT 1', [input.brand, input.model, input.packSize]);
      if ((duplicates as RowDataPacket[]).length) throw Object.assign(new Error('An exact product with this barcode or model and pack size already exists'), { status: 409 });
      const slug = productSlug(input.title, input.model);
      const [result] = await connection.execute('INSERT INTO products (slug,title,brand,model,barcode,pack_size,category,description,specifications,selling_price,status,review_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [slug, input.title, input.brand, input.model, input.barcode || null, input.packSize, input.category, input.description, JSON.stringify(input.specifications), input.sellingPrice, input.status, 'New product requires supplier verification']);
      const id = Number((result as { insertId: number }).insertId);
      if (input.imageUrl) await connection.execute('INSERT INTO product_images (product_id,url,alt_text,sort_order) VALUES (?,?,?,0)', [id, input.imageUrl, input.title]);
      await connection.execute('INSERT INTO price_history (product_id,supplier_cost,selling_price,reason,changed_by_admin_id) VALUES (?,NULL,?,?,?)', [id, input.sellingPrice, 'Product created', response.locals.admin.sub]);
      return { id, slug };
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
    response.json({ ...product, offers });
  } catch (error) { next(error); }
});

app.patch('/api/admin/products/:id', requireAdmin, async (request, response, next) => {
  try {
    const input = adminProductUpdateSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute('SELECT title,selling_price FROM products WHERE id=? AND deleted_at IS NULL FOR UPDATE', [request.params.id]);
      const current = (rows as (RowDataPacket & { title: string; selling_price: number })[])[0];
      if (!current) throw Object.assign(new Error('Product not found'), { status: 404 });
      const columns: Record<string, string> = { title: 'title', brand: 'brand', model: 'model', barcode: 'barcode', packSize: 'pack_size', category: 'category', description: 'description', specifications: 'specifications', sellingPrice: 'selling_price' };
      const entries = Object.entries(input).filter(([key]) => key !== 'imageUrl');
      if (entries.length) {
        const assignments = entries.map(([key]) => `${columns[key]}=?`).join(',');
        const values = entries.map(([key, value]) => key === 'specifications' ? JSON.stringify(value) : value === '' ? null : value);
        await connection.execute(`UPDATE products SET ${assignments},review_reason=CASE WHEN status='published' THEN 'Product details changed; supplier recheck required' ELSE review_reason END,status=CASE WHEN status='published' THEN 'pending_review' ELSE status END WHERE id=?`, [...values, request.params.id]);
      }
      if ('imageUrl' in input) {
        await connection.execute('DELETE FROM product_images WHERE product_id=? AND sort_order=0', [request.params.id]);
        if (input.imageUrl) await connection.execute('INSERT INTO product_images (product_id,url,alt_text,sort_order) VALUES (?,?,?,0)', [request.params.id, input.imageUrl, input.title || current.title]);
      }
      if (input.sellingPrice != null && Number(current.selling_price) !== input.sellingPrice) await connection.execute('INSERT INTO price_history (product_id,supplier_cost,selling_price,reason,changed_by_admin_id) VALUES (?,NULL,?,?,?)', [request.params.id, input.sellingPrice, 'Admin product edit', response.locals.admin.sub]);
    });
    response.json({ updated: true });
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
      const [rows] = await connection.execute("SELECT p.selling_price,o.id AS offer_id,o.current_cost,o.stock_status,o.last_checked_at,o.promotion_end_at,s.minimum_profit,s.minimum_margin_percent,s.free_delivery_threshold,s.standard_customer_delivery,s.supplier_stale_hours FROM products p LEFT JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC LIMIT 1) JOIN pricing_settings s ON s.id=1 WHERE p.id=? FOR UPDATE", [request.params.id]);
      const product = (rows as (RowDataPacket & { selling_price: number; offer_id: number | null; current_cost: number | null; stock_status: string | null; last_checked_at: Date | null; promotion_end_at: Date | null; minimum_profit: number; minimum_margin_percent: number; free_delivery_threshold: number; standard_customer_delivery: number; supplier_stale_hours: number })[])[0];
      if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
      if (input.status === 'published') {
        const now = Date.now();
        const unsafe = !product.offer_id || !['in_stock','low_stock'].includes(product.stock_status || '') || !product.last_checked_at || now - new Date(product.last_checked_at).getTime() > product.supplier_stale_hours * 3_600_000 || (product.promotion_end_at && new Date(product.promotion_end_at).getTime() <= now);
        if (unsafe) throw Object.assign(new Error('A fresh, exact, in-stock supplier offer is required before publication'), { status: 422 });
        const customerDeliveryCharged = input.sellingPrice >= product.free_delivery_threshold ? 0 : product.standard_customer_delivery;
        const pricing = passesPricingRules({ productRevenue: input.sellingPrice, customerDeliveryCharged, supplierProductCost: Number(product.current_cost), supplierDelivery: input.supplierDelivery, customerDeliveryCost: input.customerDeliveryCost, packaging: input.packaging, paymentFees: input.paymentFees, advertisingCost: input.advertisingCost }, Number(product.minimum_profit), Number(product.minimum_margin_percent));
        if (!pricing.passes) throw Object.assign(new Error(`Product fails pricing rules (${pricing.margin.toFixed(1)}% margin, ${pricing.profit.toFixed(2)} profit)`), { status: 422 });
      }
      if (Number(product.selling_price) !== input.sellingPrice) await connection.execute('INSERT INTO price_history (product_id,supplier_offer_id,supplier_cost,selling_price,reason,changed_by_admin_id) VALUES (?,?,?,?,?,?)', [request.params.id, product.offer_id, product.current_cost, input.sellingPrice, input.reviewReason || 'Admin review price change', response.locals.admin.sub]);
      await connection.execute('UPDATE products SET status=?,selling_price=?,review_reason=? WHERE id=?', [input.status, input.sellingPrice, input.reviewReason || null, request.params.id]);
    });
    response.json({ status: input.status, sellingPrice: input.sellingPrice });
  } catch (error) { next(error); }
});

app.get('/api/admin/pricing-settings', requireAdmin, async (_request, response, next) => {
  try { if (!pool) return response.json(null); const [rows] = await pool.execute('SELECT * FROM pricing_settings WHERE id=1'); response.json((rows as RowDataPacket[])[0]); } catch (error) { next(error); }
});

app.patch('/api/admin/pricing-settings', requireAdmin, async (request, response, next) => {
  try { const input = pricingSettingsSchema.parse(request.body); if (!pool) return response.status(503).json({ error: 'Database not configured' }); await pool.execute('UPDATE pricing_settings SET minimum_profit=?,minimum_margin_percent=?,free_delivery_threshold=?,standard_customer_delivery=?,supplier_stale_hours=? WHERE id=1', [input.minimumProfit,input.minimumMarginPercent,input.freeDeliveryThreshold,input.standardCustomerDelivery,input.supplierStaleHours]); response.json(input); } catch (error) { next(error); }
});

app.get('/api/admin/orders', requireAdmin, async (_request, response, next) => {
  try { if (!pool) return response.json(memoryOrders); const [rows] = await pool.execute('SELECT * FROM order_requests ORDER BY created_at DESC LIMIT 200'); response.json(rows); } catch (error) { next(error); }
});

app.patch('/api/admin/orders/:id/status', requireAdmin, async (request, response, next) => {
  try {
    const { status } = orderStatusSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const [rows] = await pool.execute('SELECT status FROM order_requests WHERE id=?', [request.params.id]);
    const current = (rows as (RowDataPacket & { status: string })[])[0]?.status;
    if (!current) return response.status(404).json({ error: 'Order not found' });
    const transitions: Record<string, string[]> = { requested:['checking_supplier','cancelled'], checking_supplier:['quoted','cancelled'], quoted:['awaiting_payment','cancelled'], awaiting_payment:['cancelled'], paid:['purchasing','refunded'], purchasing:['shipped','refunded'], shipped:['delivered','refunded'], delivered:['refunded'], cancelled:[], refunded:[] };
    if (!transitions[current]?.includes(status)) return response.status(409).json({ error: `Cannot move an order from ${current} to ${status}` });
    if (status === 'paid') return response.status(409).json({ error: 'Use the payment verification endpoint to mark an order paid' });
    await pool.execute('UPDATE order_requests SET status=? WHERE id=?', [status, request.params.id]);
    response.json({ status });
  } catch (error) { next(error); }
});

app.patch('/api/admin/orders/:id/quote', requireAdmin, async (request, response, next) => {
  try {
    const input = quoteSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const [rows] = await pool.execute('SELECT product_revenue FROM order_requests WHERE id=? FOR UPDATE', [request.params.id]);
    const order = (rows as (RowDataPacket & { product_revenue: number })[])[0];
    if (!order) return response.status(404).json({ error: 'Order not found' });
    const profit = calculateProfit({ productRevenue: Number(order.product_revenue), customerDeliveryCharged: input.customerDeliveryCharged, supplierProductCost: input.supplierProductCost, supplierDelivery: input.supplierDelivery, customerDeliveryCost: input.customerDeliveryCost, packaging: input.packagingCost, paymentFees: input.paymentFeeEstimate, advertisingCost: input.advertisingCost });
    const pricing = passesPricingRules({ productRevenue: Number(order.product_revenue), customerDeliveryCharged: input.customerDeliveryCharged, supplierProductCost: input.supplierProductCost, supplierDelivery: input.supplierDelivery, customerDeliveryCost: input.customerDeliveryCost, packaging: input.packagingCost, paymentFees: input.paymentFeeEstimate, advertisingCost: input.advertisingCost }, Number(process.env.MIN_EXPECTED_PROFIT || 120), Number(process.env.MIN_MARGIN_PERCENT || 15));
    if (!pricing.passes) return response.status(422).json({ error: 'Quote does not meet configured profit rules', profit, margin: pricing.margin });
    await pool.execute("UPDATE order_requests SET status='quoted',customer_delivery_charged=?,supplier_product_cost=?,supplier_delivery=?,customer_delivery_cost=?,packaging_cost=?,payment_fee_estimate=?,advertising_cost=?,expected_profit=?,quoted_at=UTC_TIMESTAMP() WHERE id=?", [input.customerDeliveryCharged, input.supplierProductCost, input.supplierDelivery, input.customerDeliveryCost, input.packagingCost, input.paymentFeeEstimate, input.advertisingCost, profit, request.params.id]);
    response.json({ profit, margin: pricing.margin, status: 'quoted' });
  } catch (error) { next(error); }
});

app.post('/api/admin/orders/:id/payment-link', requireAdmin, async (request, response, next) => {
  try {
    const input = paymentLinkSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute("SELECT status FROM order_requests WHERE id=? FOR UPDATE", [request.params.id]);
      const order = (rows as (RowDataPacket & { status: string })[])[0];
      if (!order || order.status !== 'quoted') throw Object.assign(new Error('Only quoted orders can receive a payment link'), { status: 409 });
      await connection.execute('INSERT INTO payment_references (order_request_id,provider,payment_link,external_reference) VALUES (?,?,?,?)', [request.params.id, input.provider, input.paymentLink, input.externalReference]);
      await connection.execute("UPDATE order_requests SET status='awaiting_payment' WHERE id=?", [request.params.id]);
    });
    response.status(201).json({ status: 'awaiting_payment' });
  } catch (error) { next(error); }
});

app.patch('/api/admin/orders/:id/confirm-payment', requireAdmin, async (request, response, next) => {
  try {
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const paymentReference = String(request.body?.externalReference || '');
    const [result] = await pool.execute("UPDATE payment_references pr JOIN order_requests o ON o.id=pr.order_request_id SET pr.verification_status='verified',pr.verified_at=UTC_TIMESTAMP(),o.status='paid' WHERE o.id=? AND pr.external_reference=? AND o.status='awaiting_payment'", [request.params.id, paymentReference]);
    if ((result as { affectedRows: number }).affectedRows === 0) return response.status(409).json({ error: 'Payment reference could not be verified for this order' });
    response.json({ status: 'paid' });
  } catch (error) { next(error); }
});

app.use((_request, response) => response.status(404).json({ error: 'Not found' }));
app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  void _next;
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : error && typeof error === 'object' && 'issues' in error ? 400 : 500;
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  if (status >= 500) console.error(error);
  response.status(status).json({ error: status >= 500 ? 'Unexpected server error' : message });
});

export default app;
