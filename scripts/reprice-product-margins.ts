import mysql from 'mysql2/promise';
import { profitProtectedSellingPrice } from '../shared/domain.js';

const APPLY = process.env.REPRICE_LIVE === 'true';
const MINIMUM_PROFIT = Math.max(10, Number(process.env.MINIMUM_PRODUCT_PROFIT || 10));
const MINIMUM_MARGIN_PERCENT = Math.max(4, Number(process.env.MINIMUM_PRODUCT_MARGIN_PERCENT || 4));

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  await connection.beginTransaction();
  const [rows] = await connection.query(`SELECT p.id,p.status,p.review_reason,p.selling_price,p.minimum_profit,
      o.id AS offer_id,o.current_cost,o.original_displayed_price,o.promotion_end_at,
      s.minimum_profit AS global_minimum_profit,s.minimum_margin_percent,s.standard_markup_percent
    FROM products p
    JOIN supplier_offers o ON o.id=(SELECT latest.id FROM supplier_offers latest WHERE latest.product_id=p.id ORDER BY latest.last_checked_at DESC,latest.id DESC LIMIT 1)
    JOIN pricing_settings s ON s.id=1
    WHERE p.deleted_at IS NULL AND o.current_cost>0
    FOR UPDATE`);

  const adjustments = (rows as Record<string, unknown>[]).flatMap((row) => {
    const currentPrice = Number(row.selling_price);
    const cost = Number(row.current_cost);
    const minimumProfit = Math.max(MINIMUM_PROFIT, Number(row.minimum_profit ?? row.global_minimum_profit));
    const minimumMargin = Math.max(MINIMUM_MARGIN_PERCENT, Number(row.minimum_margin_percent));
    const currentProfit = currentPrice - cost;
    const currentMargin = currentProfit / currentPrice * 100;
    if (currentProfit >= minimumProfit && currentMargin >= minimumMargin) return [];
    const target = profitProtectedSellingPrice({
      cost,
      originalPrice: row.original_displayed_price == null ? null : Number(row.original_displayed_price),
      promotionEndAt: row.promotion_end_at as Date | null,
    }, Number(row.standard_markup_percent), minimumProfit, minimumMargin).sellingPrice;
    return [{ id: Number(row.id), offerId: Number(row.offer_id), cost, oldPrice: currentPrice, newPrice: target, status: String(row.status) }];
  });

  const [restorableRows] = await connection.query(`SELECT COUNT(*) AS count FROM products
    WHERE deleted_at IS NULL AND status='paused' AND review_reason='estimated_profit_below_R10'`);
  const restorableCount = Number((restorableRows as { count: number }[])[0]?.count || 0);
  const summary = {
    mode: APPLY ? 'applied' : 'dry-run',
    minimumProductProfit: MINIMUM_PROFIT,
    minimumProductMarginPercent: MINIMUM_MARGIN_PERCENT,
    productsChecked: rows.length,
    pricesToIncrease: adjustments.length,
    previouslyPausedToRestore: restorableCount,
    largestIncrease: adjustments.length ? Math.max(...adjustments.map((item) => item.newPrice - item.oldPrice)).toFixed(2) : '0.00',
  };

  if (!APPLY) {
    await connection.rollback();
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    await connection.query(`CREATE TEMPORARY TABLE product_margin_adjustments (
      product_id BIGINT UNSIGNED PRIMARY KEY,
      offer_id BIGINT UNSIGNED NOT NULL,
      supplier_cost DECIMAL(12,2) NOT NULL,
      old_price DECIMAL(12,2) NOT NULL,
      new_price DECIMAL(12,2) NOT NULL
    )`);
    for (let offset = 0; offset < adjustments.length; offset += 500) {
      const batch = adjustments.slice(offset, offset + 500);
      if (!batch.length) continue;
      await connection.query(`INSERT INTO product_margin_adjustments (product_id,offer_id,supplier_cost,old_price,new_price) VALUES ${batch.map(() => '(?,?,?,?,?)').join(',')}`,
        batch.flatMap((item) => [item.id, item.offerId, item.cost, item.oldPrice, item.newPrice]));
    }
    const [historyResult] = await connection.query(`INSERT INTO price_history (product_id,supplier_offer_id,supplier_cost,selling_price,reason)
      SELECT product_id,offer_id,supplier_cost,new_price,CONCAT('Raised from R',FORMAT(old_price,2),' to enforce R',FORMAT(?,2),' product profit and ',FORMAT(?,2),'% product margin; delivery excluded')
      FROM product_margin_adjustments`, [MINIMUM_PROFIT, MINIMUM_MARGIN_PERCENT]);
    const [updateResult] = await connection.query(`UPDATE products p JOIN product_margin_adjustments adjustment ON adjustment.product_id=p.id
      SET p.selling_price=adjustment.new_price`);

    const [adminRows] = await connection.query("SELECT id FROM admins WHERE role='admin' ORDER BY id LIMIT 1");
    const adminId = (adminRows as { id: number }[])[0]?.id;
    if (restorableCount && !adminId) throw new Error('No administrator is available to own restoration audit records');
    let restored = 0;
    if (restorableCount) {
      const [reviewResult] = await connection.execute(`INSERT INTO product_reviews (product_id,admin_id,previous_status,decision,checklist,notes)
        SELECT id,?,'paused','published',JSON_OBJECT('minimumProfitChecked',TRUE,'minimumMarginChecked',TRUE),
          'Restored after confirming the product-only R10 and 4% guardrails; customer delivery is excluded from product profit.'
        FROM products WHERE deleted_at IS NULL AND status='paused' AND review_reason='estimated_profit_below_R10'`, [adminId]);
      const [restoreResult] = await connection.query(`UPDATE products SET status='published',review_reason=NULL
        WHERE deleted_at IS NULL AND status='paused' AND review_reason='estimated_profit_below_R10'`);
      if (reviewResult.affectedRows !== restoreResult.affectedRows) throw new Error('Restoration audit count mismatch');
      restored = restoreResult.affectedRows;
    }

    await connection.query(`UPDATE pricing_settings SET minimum_profit=GREATEST(minimum_profit,?),minimum_margin_percent=GREATEST(minimum_margin_percent,?) WHERE id=1`, [MINIMUM_PROFIT, MINIMUM_MARGIN_PERCENT]);
    const [verificationRows] = await connection.query(`SELECT COUNT(*) AS checked,
        SUM((p.selling_price-o.current_cost)<GREATEST(?,COALESCE(p.minimum_profit,s.minimum_profit))) AS below_profit_floor,
        SUM(((p.selling_price-o.current_cost)/p.selling_price*100)<GREATEST(?,s.minimum_margin_percent)) AS below_margin_floor
      FROM products p
      JOIN supplier_offers o ON o.id=(SELECT latest.id FROM supplier_offers latest WHERE latest.product_id=p.id ORDER BY latest.last_checked_at DESC,latest.id DESC LIMIT 1)
      JOIN pricing_settings s ON s.id=1 WHERE p.deleted_at IS NULL AND o.current_cost>0`, [MINIMUM_PROFIT, MINIMUM_MARGIN_PERCENT]);
    const verification = (verificationRows as Record<string, unknown>[])[0];
    if (Number(verification.below_profit_floor) || Number(verification.below_margin_floor) || updateResult.affectedRows !== adjustments.length || historyResult.affectedRows !== adjustments.length) {
      throw new Error(`Post-repricing verification failed: ${JSON.stringify(verification)}`);
    }
    await connection.commit();
    process.stdout.write(`${JSON.stringify({ ...summary, priceHistoryRows: historyResult.affectedRows, productsRepriced: updateResult.affectedRows, productsRestored: restored, verification }, null, 2)}\n`);
  }
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
