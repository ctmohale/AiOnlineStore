import 'dotenv/config';
import cron from 'node-cron';
import { pool } from '../server/db/pool.js';
import { PermittedRetailerFeedAdapter } from './adapters/retailerFeed.js';
import { ingest } from './ingest.js';

async function dailyRun() {
  if (process.env.RETAILER_FEED_URL) await ingest(new PermittedRetailerFeedAdapter(process.env.RETAILER_FEED_URL));
  else console.log('No RETAILER_FEED_URL configured; skipping feed collection. CSV imports remain available via the CLI.');
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
