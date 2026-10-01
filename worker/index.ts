import 'dotenv/config';
import cron from 'node-cron';
import { pool, withTransaction } from '../server/db/pool.js';
import { importProductUrl, isSupportedProductUrl } from '../server/product-import.js';
import { recommendedSellingPrice } from '../shared/domain.js';
import { PermittedRetailerFeedAdapter } from './adapters/retailerFeed.js';
import { ingest } from './ingest.js';

async function recheckRetailerOffers() {
  if (!pool) return;
  const [rows] = await pool.execute(`SELECT o.id,o.product_id,o.source_url
    FROM supplier_offers o JOIN products p ON p.id=o.product_id
    WHERE p.deleted_at IS NULL AND o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1)
      AND o.source_url<>'' AND (o.promotion_end_at<=UTC_TIMESTAMP() OR o.last_checked_at IS NULL OR o.last_checked_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 20 HOUR))
    ORDER BY o.last_checked_at ASC LIMIT 100`);
  for (const row of rows as { id: number; product_id: number; source_url: string }[]) {
    if (!isSupportedProductUrl(row.source_url)) continue;
    try {
      const imported = await importProductUrl(row.source_url);
      if (imported.currentCost == null) throw new Error('No supplier price was present in public product metadata');
      if (!['in_stock', 'low_stock', 'out_of_stock'].includes(imported.stockStatus)) throw new Error('The retailer page did not confirm stock status');
      await withTransaction(async (connection) => {
        const [lockedRows] = await connection.execute('SELECT current_cost,price_verified,promotion_end_at FROM supplier_offers WHERE id=? FOR UPDATE', [row.id]);
        const locked = (lockedRows as { current_cost: number | null; price_verified: boolean; promotion_end_at: Date | null }[])[0];
        if (!locked) return;
        const changed = locked.current_cost == null || Number(locked.current_cost) !== imported.currentCost;
        const expired = locked.promotion_end_at && new Date(locked.promotion_end_at).getTime() <= Date.now();
        const [imageRows] = await connection.execute('SELECT url FROM product_images WHERE product_id=? ORDER BY sort_order,id', [row.product_id]);
        const existingImages = new Set((imageRows as { url: string }[]).map((image) => image.url));
        let nextImageOrder = existingImages.size;
        for (const url of imported.imageUrls) if (!existingImages.has(url) && nextImageOrder < 20) {
          await connection.execute("INSERT INTO product_images (product_id,url,alt_text,sort_order) SELECT id,?,CONCAT(title,' - image ',?),? FROM products WHERE id=?", [url, nextImageOrder + 1, nextImageOrder, row.product_id]);
          existingImages.add(url); nextImageOrder += 1;
        }
        await connection.execute('UPDATE products SET gallery_checked_at=UTC_TIMESTAMP(),gallery_image_count=? WHERE id=?', [existingImages.size, row.product_id]);
        await connection.execute(`UPDATE supplier_offers SET retailer=?,source_url=?,supplier_sku=COALESCE(?,supplier_sku),current_cost=?,original_displayed_price=CASE WHEN ? THEN NULL ELSE COALESCE(?,original_displayed_price) END,promotion_end_at=CASE WHEN ? THEN NULL ELSE promotion_end_at END,stock_status=?,fulfilment_type=?,fulfilment_signal=?,last_checked_at=UTC_TIMESTAMP(),source_confidence=?,price_verified=?,price_updated_at=CASE WHEN ? THEN UTC_TIMESTAMP() ELSE price_updated_at END,price_change_reason=CASE WHEN ? THEN 'Daily URL recheck found a supplier price change' ELSE price_change_reason END,last_error=NULL WHERE id=?`, [imported.retailer, imported.sourceUrl, imported.supplierSku || null, imported.currentCost, Boolean(expired), imported.originalDisplayedPrice, Boolean(expired), imported.stockStatus, imported.fulfilmentType, imported.fulfilmentSignal, imported.sourceConfidence, changed ? false : imported.sourceConfidence === 'high', changed, changed, row.id]);
        if (changed) {
          await connection.execute("INSERT INTO price_history (product_id,supplier_offer_id,supplier_cost,selling_price,reason) SELECT id,?,?,selling_price,'Daily URL recheck found a supplier price change' FROM products WHERE id=?", [row.id, imported.currentCost, row.product_id]);
          await connection.execute("UPDATE products SET status='pending_review',review_reason='Supplier price changed during daily URL recheck' WHERE id=?", [row.product_id]);
        } else if (!['in_stock', 'low_stock'].includes(imported.stockStatus)) {
          await connection.execute("UPDATE products SET status='paused',review_reason='Supplier stock changed during daily URL recheck' WHERE id=? AND status='published'", [row.product_id]);
        }
      });
    } catch (error) {
      await pool.execute('UPDATE supplier_offers SET last_error=? WHERE id=?', [(error instanceof Error ? error.message : String(error)).slice(0, 2000), row.id]);
    }
  }
}

async function backfillProductGalleries() {
  if (!pool) return;
  const [rows] = await pool.execute(`SELECT p.id,o.source_url
    FROM products p JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1)
    WHERE p.deleted_at IS NULL AND o.source_url<>''
      AND (p.gallery_image_count<3 OR (SELECT COUNT(*) FROM product_images i WHERE i.product_id=p.id)<3)
      AND (p.gallery_checked_at IS NULL OR p.gallery_checked_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY))
    ORDER BY (p.status='published') DESC,p.selling_price ASC,p.gallery_checked_at IS NULL DESC,p.updated_at DESC LIMIT 300`);
  let completed = 0, enriched = 0;
  for (const row of rows as { id: number; source_url: string }[]) {
    if (!isSupportedProductUrl(row.source_url)) continue;
    try {
      const imported = await importProductUrl(row.source_url);
      await withTransaction(async (connection) => {
        const [currentRows] = await connection.execute('SELECT url FROM product_images WHERE product_id=? ORDER BY sort_order,id FOR UPDATE', [row.id]);
        const existing = new Set((currentRows as { url: string }[]).map((image) => image.url));
        const before = existing.size;
        let order = existing.size;
        for (const url of imported.imageUrls) if (!existing.has(url) && order < 20) {
          await connection.execute("INSERT INTO product_images (product_id,url,alt_text,sort_order) SELECT id,?,CONCAT(title,' - image ',?),? FROM products WHERE id=?", [url, order + 1, order, row.id]);
          existing.add(url); order += 1;
        }
        await connection.execute('UPDATE products SET gallery_checked_at=UTC_TIMESTAMP(),gallery_image_count=? WHERE id=?', [existing.size, row.id]);
        if (existing.size > before) enriched += 1;
      });
      completed += 1;
    } catch (error) {
      await pool.execute('UPDATE products SET gallery_checked_at=UTC_TIMESTAMP(),gallery_image_count=(SELECT COUNT(*) FROM product_images i WHERE i.product_id=products.id) WHERE id=?', [row.id]);
      console.warn(`Gallery backfill failed for product ${row.id}:`, error instanceof Error ? error.message : error);
    }
  }
  console.log(`Gallery backfill checked ${completed} products and enriched ${enriched}.`);
}

async function repriceVerifiedOffers() {
  if (!pool) return;
  const [rows] = await pool.execute(`SELECT p.id FROM products p JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1) JOIN pricing_settings s ON s.id=1
    WHERE p.deleted_at IS NULL AND p.status IN ('published','paused','pending_review') AND o.price_verified=TRUE AND o.stock_status IN ('in_stock','low_stock')
      AND o.last_checked_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL s.supplier_stale_hours HOUR)
      AND (o.promotion_end_at IS NULL OR o.promotion_end_at>UTC_TIMESTAMP()) LIMIT 1200`);
  for (const row of rows as { id: number }[]) await withTransaction(async (connection) => {
    const [lockedRows] = await connection.execute(`SELECT p.status,p.review_reason,p.selling_price,p.minimum_profit,p.estimated_customer_delivery_cost,p.gallery_image_count,i.url AS image_url,o.id AS offer_id,o.current_cost,o.original_displayed_price,o.supplier_delivery_cost,o.stock_status,o.last_checked_at,o.promotion_end_at,o.price_verified,s.standard_markup_percent,s.minimum_profit AS global_minimum_profit,s.minimum_margin_percent,s.free_delivery_threshold,s.standard_customer_delivery,s.supplier_stale_hours
      FROM products p LEFT JOIN product_images i ON i.product_id=p.id AND i.sort_order=0 JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1) JOIN pricing_settings s ON s.id=1 WHERE p.id=? FOR UPDATE`, [row.id]);
    const item = (lockedRows as Record<string, unknown>[])[0];
    if (!item || !item.price_verified || !['in_stock','low_stock'].includes(String(item.stock_status)) || new Date(item.last_checked_at as Date).getTime() < Date.now() - Number(item.supplier_stale_hours) * 3_600_000 || (item.promotion_end_at && new Date(item.promotion_end_at as Date).getTime() <= Date.now())) return;
    if (!String(item.image_url || '').startsWith('https://') || Number(item.gallery_image_count || 0) < 1) {
      await connection.execute("UPDATE products SET status='paused',review_reason='gallery_incomplete' WHERE id=?", [row.id]);
      return;
    }
    const { sellingPrice } = recommendedSellingPrice({ cost: Number(item.current_cost), originalPrice: item.original_displayed_price == null ? null : Number(item.original_displayed_price), promotionEndAt: item.promotion_end_at as Date | null }, Number(item.standard_markup_percent));
    const customerDelivery = sellingPrice >= Number(item.free_delivery_threshold) ? 0 : Number(item.standard_customer_delivery);
    const profit = sellingPrice + customerDelivery - Number(item.current_cost) - Number(item.supplier_delivery_cost || 0) - Number(item.estimated_customer_delivery_cost || 0);
    const margin = profit / sellingPrice * 100;
    if (profit <= 0 || profit < Number(item.minimum_profit ?? item.global_minimum_profit) || margin < Number(item.minimum_margin_percent)) {
      await connection.execute("UPDATE products SET status='pending_review',review_reason='New price does not cover estimated costs' WHERE id=?", [row.id]);
      return;
    }
    if (Number(item.selling_price) !== sellingPrice) {
      await connection.execute('UPDATE products SET selling_price=? WHERE id=?', [sellingPrice, row.id]);
      await connection.execute("INSERT INTO price_history (product_id,supplier_offer_id,supplier_cost,selling_price,reason) VALUES (?,?,?,?,'Source pricing rule applied after supplier check')", [row.id, Number(item.offer_id), Number(item.current_cost), sellingPrice]);
    }
    if (['paused','pending_review'].includes(String(item.status)) && ['supplier_data_stale','supplier_confirmation_required','Supplier stock changed during daily URL recheck','New price does not cover estimated costs','gallery_incomplete','supplier_price_unverified','catalogue_quality_gate'].includes(String(item.review_reason))) await connection.execute("UPDATE products SET status='published',review_reason=NULL WHERE id=?", [row.id]);
    else if (String(item.status) === 'published' && ['supplier_data_stale','supplier_confirmation_required'].includes(String(item.review_reason))) await connection.execute('UPDATE products SET review_reason=NULL WHERE id=?', [row.id]);
  });
}

async function dailyRun() {
  if (process.env.RETAILER_FEED_URL) await ingest(new PermittedRetailerFeedAdapter(process.env.RETAILER_FEED_URL));
  else console.log('No RETAILER_FEED_URL configured; skipping feed collection. CSV imports remain available via the CLI.');
  await backfillProductGalleries();
  await recheckRetailerOffers();
  await repriceVerifiedOffers();
  if (pool) {
    await pool.execute("UPDATE products p JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1) SET p.status='paused',p.review_reason=CASE WHEN p.gallery_image_count<1 THEN 'gallery_incomplete' WHEN o.price_verified=FALSE THEN 'supplier_price_unverified' WHEN o.promotion_end_at<=UTC_TIMESTAMP() THEN 'promotion_expired' ELSE 'supplier_out_of_stock' END WHERE p.status='published' AND (p.gallery_image_count<1 OR o.price_verified=FALSE OR o.promotion_end_at<=UTC_TIMESTAMP() OR o.stock_status NOT IN ('in_stock','low_stock'))");
    await pool.execute("UPDATE products p JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1) JOIN pricing_settings s ON s.id=1 SET p.review_reason='supplier_confirmation_required' WHERE p.status='published' AND p.deleted_at IS NULL AND (o.last_checked_at IS NULL OR o.last_checked_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL s.supplier_stale_hours HOUR)) AND (p.review_reason IS NULL OR p.review_reason IN ('supplier_data_stale','supplier_confirmation_required'))");
  }
}

async function promotionEndRecheck() {
  if (!pool) return;
  const [rows] = await pool.execute("SELECT COUNT(*) AS due FROM supplier_offers WHERE promotion_end_at BETWEEN UTC_TIMESTAMP() AND DATE_ADD(UTC_TIMESTAMP(),INTERVAL 65 MINUTE)");
  if (Number((rows as { due: number }[])[0]?.due) > 0) await dailyRun();
}

cron.schedule(process.env.WORKER_CRON || '0 * * * *', () => void dailyRun().catch(console.error), { timezone: 'Africa/Johannesburg' });
cron.schedule('5 * * * *', () => void promotionEndRecheck().catch(console.error), { timezone: 'Africa/Johannesburg' });
console.log('Mzansi Mega Store worker scheduled.');
if (process.argv.includes('--once')) dailyRun().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
else void dailyRun().catch((error) => { console.error(error); setTimeout(() => void dailyRun().catch(console.error), 60_000); });
