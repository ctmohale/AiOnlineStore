import 'dotenv/config';
import cron from 'node-cron';
import { pool, withTransaction } from '../server/db/pool.js';
import { importProductUrl, isSupportedProductUrl } from '../server/product-import.js';
import { PermittedRetailerFeedAdapter } from './adapters/retailerFeed.js';
import { ingest } from './ingest.js';

async function recheckUndatedRetailerOffers() {
  if (!pool) return;
  const [rows] = await pool.execute(`SELECT o.id,o.product_id,o.source_url
    FROM supplier_offers o JOIN products p ON p.id=o.product_id
    WHERE p.deleted_at IS NULL AND o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1)
      AND o.promotion_end_at IS NULL AND o.source_url<>'' AND (o.last_checked_at IS NULL OR o.last_checked_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 20 HOUR))
    ORDER BY o.last_checked_at ASC LIMIT 100`);
  for (const row of rows as { id: number; product_id: number; source_url: string }[]) {
    if (!isSupportedProductUrl(row.source_url)) continue;
    try {
      const imported = await importProductUrl(row.source_url);
      if (imported.currentCost == null) throw new Error('No supplier price was present in public product metadata');
      await withTransaction(async (connection) => {
        const [lockedRows] = await connection.execute('SELECT current_cost,price_verified FROM supplier_offers WHERE id=? FOR UPDATE', [row.id]);
        const locked = (lockedRows as { current_cost: number | null; price_verified: boolean }[])[0];
        if (!locked) return;
        const changed = locked.current_cost == null || Number(locked.current_cost) !== imported.currentCost;
        await connection.execute(`UPDATE supplier_offers SET retailer=?,source_url=?,supplier_sku=COALESCE(?,supplier_sku),current_cost=?,original_displayed_price=COALESCE(?,original_displayed_price),stock_status=?,last_checked_at=UTC_TIMESTAMP(),source_confidence=?,price_verified=?,price_updated_at=CASE WHEN ? THEN UTC_TIMESTAMP() ELSE price_updated_at END,price_change_reason=CASE WHEN ? THEN 'Daily URL recheck found a supplier price change' ELSE price_change_reason END,last_error=NULL WHERE id=?`, [imported.retailer, imported.sourceUrl, imported.supplierSku || null, imported.currentCost, imported.originalDisplayedPrice, imported.stockStatus, imported.sourceConfidence, changed ? false : Boolean(locked.price_verified), changed, changed, row.id]);
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

async function dailyRun() {
  if (process.env.RETAILER_FEED_URL) await ingest(new PermittedRetailerFeedAdapter(process.env.RETAILER_FEED_URL));
  else console.log('No RETAILER_FEED_URL configured; skipping feed collection. CSV imports remain available via the CLI.');
  await recheckUndatedRetailerOffers();
  if (pool) await pool.execute("UPDATE products p JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY last_checked_at DESC,id DESC LIMIT 1) JOIN pricing_settings s ON s.id=1 SET p.status='paused',p.review_reason=CASE WHEN o.price_verified=FALSE THEN 'supplier_price_unverified' WHEN o.promotion_end_at<=UTC_TIMESTAMP() THEN 'promotion_expired' WHEN o.stock_status='out_of_stock' THEN 'supplier_out_of_stock' ELSE 'supplier_data_stale' END WHERE p.status='published' AND (o.price_verified=FALSE OR o.promotion_end_at<=UTC_TIMESTAMP() OR o.stock_status='out_of_stock' OR o.last_checked_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL s.supplier_stale_hours HOUR))");
}

async function promotionEndRecheck() {
  if (!pool) return;
  const [rows] = await pool.execute("SELECT COUNT(*) AS due FROM supplier_offers WHERE promotion_end_at BETWEEN UTC_TIMESTAMP() AND DATE_ADD(UTC_TIMESTAMP(),INTERVAL 65 MINUTE)");
  if (Number((rows as { due: number }[])[0]?.due) > 0) await dailyRun();
}

cron.schedule(process.env.WORKER_CRON || '0 3 * * *', () => void dailyRun().catch(console.error), { timezone: 'Africa/Johannesburg' });
cron.schedule('5 * * * *', () => void promotionEndRecheck().catch(console.error), { timezone: 'Africa/Johannesburg' });
console.log('Moya Market worker scheduled.');
if (process.argv.includes('--once')) dailyRun().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
