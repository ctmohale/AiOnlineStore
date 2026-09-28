import 'dotenv/config';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { calculateProfit, passesPricingRules } from '../shared/domain.js';
import { optionalCustomer, requireAdmin, requireCustomer, signAdminToken, signCustomerToken } from './auth.js';
import { pool, withTransaction } from './db/pool.js';
import { importProductUrl } from './product-import.js';
import { adminProductCreateSchema, adminProductUpdateSchema, customerLoginSchema, customerRegisterSchema, orderSchema, orderStatusSchema, paymentLinkSchema, pricingSettingsSchema, productReviewSchema, productUrlImportSchema, quoteSchema } from './validation.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL?.split(',') || ['http://localhost:5173'], methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '200kb' }));

const publicLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
const memoryOrders: unknown[] = [];
const reference = () => `MY-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
const productSlug = (title: string, model: string) => `${title}-${model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 170) + `-${crypto.randomBytes(3).toString('hex')}`;

async function assertProductPublishable(connection: PoolConnection, productId: number | string) {
  const [rows] = await connection.execute(`SELECT p.title,p.category,p.model,p.pack_size,p.selling_price,p.minimum_profit,p.estimated_customer_delivery_cost,
    o.id AS offer_id,o.source_url,o.current_cost,o.stock_status,o.last_checked_at,o.promotion_end_at,o.price_verified,o.supplier_delivery_cost,
    s.minimum_profit AS global_minimum_profit,s.minimum_margin_percent,s.supplier_stale_hours
    FROM products p LEFT JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1)
    JOIN pricing_settings s ON s.id=1 WHERE p.id=? AND p.deleted_at IS NULL FOR UPDATE`, [productId]);
  const product = (rows as (RowDataPacket & Record<string, unknown>)[])[0];
  if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
  const missing: string[] = [];
  if (!String(product.title || '').trim()) missing.push('product name');
  if (!String(product.category || '').trim()) missing.push('category');
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
  const pricing = passesPricingRules({ productRevenue: Number(product.selling_price), customerDeliveryCharged: 0, supplierProductCost: Number(product.current_cost), supplierDelivery: Number(product.supplier_delivery_cost || 0), customerDeliveryCost: Number(product.estimated_customer_delivery_cost || 0), packaging: 0, paymentFees: 0, advertisingCost: 0 }, Number(product.minimum_profit ?? product.global_minimum_profit), Number(product.minimum_margin_percent));
  if (!pricing.passes) throw Object.assign(new Error(`Estimated profit is below the product guardrail (${pricing.margin.toFixed(1)}% margin, R${pricing.profit.toFixed(2)} profit)`), { status: 422 });
  return pricing;
}

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
    const terms: string[] = ["p.status = 'published'", 'p.deleted_at IS NULL', 'o.price_verified = TRUE', "o.stock_status IN ('in_stock','low_stock')", 'o.last_checked_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL COALESCE(s.supplier_stale_hours,24) HOUR)', '(o.promotion_end_at IS NULL OR o.promotion_end_at > UTC_TIMESTAMP())'];
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
      const [rows] = await connection.execute(`SELECT p.id,p.title,p.model,p.pack_size,p.selling_price,p.estimated_customer_delivery_cost,o.current_cost,o.supplier_delivery_cost,o.stock_status,o.last_checked_at,o.promotion_end_at,COALESCE(s.supplier_stale_hours,24) AS stale_hours,COALESCE(s.free_delivery_threshold,999) AS free_threshold,COALESCE(s.standard_customer_delivery,89) AS delivery_charge FROM products p JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1) LEFT JOIN pricing_settings s ON s.id=1 WHERE p.id IN (${placeholders}) AND p.status='published' AND p.deleted_at IS NULL AND o.price_verified=TRUE FOR UPDATE`, ids);
      const productRows = rows as (RowDataPacket & { id: number; title: string; model: string; pack_size: string; selling_price: number; estimated_customer_delivery_cost: number; current_cost: number; supplier_delivery_cost: number; stock_status: string; last_checked_at: Date; promotion_end_at: Date | null; stale_hours: number; free_threshold: number; delivery_charge: number })[];
      if (productRows.length !== ids.length) throw Object.assign(new Error('One or more products are not available'), { status: 409 });
      const now = Date.now();
      for (const product of productRows) if (!['in_stock','low_stock'].includes(product.stock_status) || now - new Date(product.last_checked_at).getTime() > product.stale_hours * 3_600_000 || (product.promotion_end_at && new Date(product.promotion_end_at).getTime() <= now)) throw Object.assign(new Error(`${product.title} needs a fresh supplier check`), { status: 409 });
      const revenue = input.items.reduce((sum, item) => sum + Number(productRows.find((row) => row.id === item.productId)!.selling_price) * item.quantity, 0);
      const settings = productRows[0];
      const delivery = revenue >= settings.free_threshold ? 0 : settings.delivery_charge;
      const supplierProductCost = input.items.reduce((sum, item) => sum + Number(productRows.find((row) => row.id === item.productId)!.current_cost) * item.quantity, 0);
      const supplierDelivery = input.items.reduce((sum, item) => sum + Number(productRows.find((row) => row.id === item.productId)!.supplier_delivery_cost || 0), 0);
      const customerDeliveryCost = Math.max(0, ...input.items.map((item) => Number(productRows.find((row) => row.id === item.productId)!.estimated_customer_delivery_cost || 0)));
      const expectedProfit = calculateProfit({ productRevenue: revenue, customerDeliveryCharged: delivery, supplierProductCost, supplierDelivery, customerDeliveryCost, packaging: 0, paymentFees: 0, advertisingCost: 0 });
      const customer = input.customer;
      const [result] = await connection.execute('INSERT INTO order_requests (customer_id,reference,customer_name,customer_email,customer_phone,address_line_1,suburb,city,province,postal_code,notes,product_revenue,customer_delivery_charged,supplier_product_cost,supplier_delivery,customer_delivery_cost,expected_profit) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [response.locals.customer?.sub || null, orderReference, customer.name, customer.email, customer.phone, customer.addressLine1, customer.suburb, customer.city, customer.province, customer.postalCode, customer.notes || null, revenue, delivery, supplierProductCost, supplierDelivery, customerDeliveryCost, expectedProfit]);
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
  try { if (!pool) return response.json([]); const [rows] = await pool.execute("SELECT p.*,i.url AS image_url,o.retailer,o.source_url,o.supplier_sku,o.current_cost,o.original_displayed_price,o.supplier_delivery_cost,o.promotion_start_at,o.promotion_end_at,o.promotion_end_provided,o.promotion_terms,o.quantity_limit,o.stock_status,o.last_checked_at,o.source_confidence,o.price_verified,o.price_updated_at,o.price_change_reason FROM products p LEFT JOIN product_images i ON i.product_id=p.id AND i.sort_order=0 LEFT JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1) WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT 500"); response.json(rows); } catch (error) { next(error); }
});

app.post('/api/admin/products/import-url', requireAdmin, async (request, response, next) => {
  try { const { url } = productUrlImportSchema.parse(request.body); response.json(await importProductUrl(url)); }
  catch (error) { next(error); }
});

app.post('/api/admin/products', requireAdmin, async (request, response, next) => {
  try {
    const input = adminProductCreateSchema.parse(request.body);
    if (!pool) return response.status(503).json({ error: 'Database not configured' });
    const created = await withTransaction(async (connection) => {
      let duplicateRows: RowDataPacket[] = [];
      if (input.barcode) {
        const [duplicates] = await connection.execute('SELECT id FROM products WHERE barcode=? AND deleted_at IS NULL LIMIT 1', [input.barcode]); duplicateRows = duplicates as RowDataPacket[];
      } else if (input.model || input.packSize) {
        const [duplicates] = await connection.execute('SELECT id FROM products WHERE LOWER(brand)=LOWER(?) AND LOWER(model)=LOWER(?) AND LOWER(pack_size)=LOWER(?) AND deleted_at IS NULL LIMIT 1', [input.brand, input.model, input.packSize]); duplicateRows = duplicates as RowDataPacket[];
      }
      if (duplicateRows.length) throw Object.assign(new Error('An exact product with this barcode or model and pack size already exists'), { status: 409 });
      const slug = productSlug(input.title, input.model);
      const [result] = await connection.execute("INSERT INTO products (slug,title,brand,model,barcode,pack_size,category,description,specifications,selling_price,minimum_profit,estimated_customer_delivery_cost,delivery_time,item_weight_size,internal_review_notes,status,review_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?)", [slug, input.title, input.brand, input.model, input.barcode || null, input.packSize, input.category, input.description, JSON.stringify(input.specifications), input.sellingPrice, input.minimumProfit ?? null, input.estimatedCustomerDeliveryCost ?? 0, input.deliveryTime || null, input.itemWeightSize || null, input.reviewNotes || null, 'New product requires supplier verification']);
      const id = Number((result as { insertId: number }).insertId);
      if (input.imageUrl) await connection.execute('INSERT INTO product_images (product_id,url,alt_text,sort_order) VALUES (?,?,?,0)', [id, input.imageUrl, input.title]);
      let offerId: number | null = null;
      const supplier = input.supplier;
      if (supplier) {
        const [offerResult] = await connection.execute(`INSERT INTO supplier_offers
          (product_id,retailer,source_url,supplier_sku,brand,model,barcode,pack_size,current_cost,original_displayed_price,supplier_delivery_cost,promotion_start_at,promotion_end_at,promotion_end_provided,promotion_terms,quantity_limit,stock_status,source_confidence,price_verified,last_checked_at,price_updated_at,price_change_reason)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, supplier.retailer || 'Not provided', supplier.sourceUrl || '', supplier.supplierSku || null, input.brand, input.model, input.barcode || null, input.packSize, supplier.currentCost ?? null, supplier.originalDisplayedPrice ?? null, supplier.supplierDeliveryCost ?? 0, supplier.promotionStartAt ?? null, supplier.promotionEndAt ?? null, Boolean(supplier.promotionEndAt || supplier.promotionEndProvided), supplier.promotionTerms || null, supplier.quantityLimit || null, supplier.stockStatus || 'unknown', supplier.sourceConfidence || 'low', Boolean(supplier.supplierPriceVerified), supplier.lastCheckedAt ?? null, supplier.priceUpdatedAt ?? (supplier.currentCost != null ? new Date() : null), supplier.priceChangeReason || 'Initial supplier entry']);
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
    response.json({ ...product, offers });
  } catch (error) { next(error); }
});

app.patch('/api/admin/products/:id', requireAdmin, async (request, response, next) => {
  try {
    const input = adminProductUpdateSchema.parse(request.body);
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
      if ('imageUrl' in input) {
        await connection.execute('DELETE FROM product_images WHERE product_id=? AND sort_order=0', [request.params.id]);
        if (input.imageUrl) await connection.execute('INSERT INTO product_images (product_id,url,alt_text,sort_order) VALUES (?,?,?,0)', [request.params.id, input.imageUrl, input.title || current.title]);
      }
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
        const offerColumns: Record<string, string> = { retailer: 'retailer', sourceUrl: 'source_url', supplierSku: 'supplier_sku', currentCost: 'current_cost', originalDisplayedPrice: 'original_displayed_price', supplierDeliveryCost: 'supplier_delivery_cost', promotionStartAt: 'promotion_start_at', promotionEndAt: 'promotion_end_at', promotionEndProvided: 'promotion_end_provided', promotionTerms: 'promotion_terms', quantityLimit: 'quantity_limit', stockStatus: 'stock_status', sourceConfidence: 'source_confidence', supplierPriceVerified: 'price_verified', lastCheckedAt: 'last_checked_at', priceUpdatedAt: 'price_updated_at', priceChangeReason: 'price_change_reason' };
        if (existing) {
          offerId = Number(existing.id);
          const offerEntries = Object.entries(supplier).filter(([key, value]) => key in offerColumns && value !== undefined);
          if (supplier.promotionEndAt && supplier.promotionEndProvided === undefined) offerEntries.push(['promotionEndProvided', true]);
          if (offerEntries.length) await connection.execute(`UPDATE supplier_offers SET ${offerEntries.map(([key]) => `${offerColumns[key]}=?`).join(',')},brand=?,model=?,barcode=?,pack_size=? WHERE id=?`, [...offerEntries.map(([, value]) => value), product.brand, product.model, product.barcode, product.pack_size, offerId]);
        } else {
          const [offerResult] = await connection.execute(`INSERT INTO supplier_offers
            (product_id,retailer,source_url,supplier_sku,brand,model,barcode,pack_size,current_cost,original_displayed_price,supplier_delivery_cost,promotion_start_at,promotion_end_at,promotion_end_provided,promotion_terms,quantity_limit,stock_status,source_confidence,price_verified,last_checked_at,price_updated_at,price_change_reason)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [request.params.id, supplier.retailer || 'Not provided', supplier.sourceUrl || '', supplier.supplierSku || null, product.brand, product.model, product.barcode, product.pack_size, supplier.currentCost ?? null, supplier.originalDisplayedPrice ?? null, supplier.supplierDeliveryCost ?? 0, supplier.promotionStartAt ?? null, supplier.promotionEndAt ?? null, Boolean(supplier.promotionEndAt || supplier.promotionEndProvided), supplier.promotionTerms || null, supplier.quantityLimit || null, supplier.stockStatus || 'unknown', supplier.sourceConfidence || 'low', Boolean(supplier.supplierPriceVerified), supplier.lastCheckedAt ?? null, supplier.priceUpdatedAt ?? (supplier.currentCost != null ? new Date() : null), supplier.priceChangeReason || 'Supplier details added']);
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
      const nextStatus = input.status || (current.status === 'published' && (entries.length || input.supplier || 'imageUrl' in input) ? 'pending_review' : current.status);
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
      const [rows] = await connection.execute("SELECT p.selling_price,o.id AS offer_id,o.current_cost FROM products p LEFT JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1) WHERE p.id=? AND p.deleted_at IS NULL FOR UPDATE", [request.params.id]);
      const product = (rows as (RowDataPacket & { selling_price: number; offer_id: number | null; current_cost: number | null })[])[0];
      if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
      if (Number(product.selling_price) !== input.sellingPrice) await connection.execute('INSERT INTO price_history (product_id,supplier_offer_id,supplier_cost,selling_price,reason,changed_by_admin_id) VALUES (?,?,?,?,?,?)', [request.params.id, product.offer_id, product.current_cost, input.sellingPrice, input.reviewReason || 'Admin review price change', response.locals.admin.sub]);
      await connection.execute('UPDATE products SET selling_price=? WHERE id=?', [input.sellingPrice, request.params.id]);
      if (input.status === 'published') await assertProductPublishable(connection, String(request.params.id));
      await connection.execute('UPDATE products SET status=?,review_reason=? WHERE id=?', [input.status, input.status === 'published' ? null : input.reviewReason || null, request.params.id]);
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
