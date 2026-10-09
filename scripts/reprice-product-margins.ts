import mysql from 'mysql2/promise';
import { profitProtectedSellingPrice } from '../shared/domain.js';

const APPLY = process.env.REPRICE_LIVE === 'true';
const MINIMUM_PROFIT = Math.max(20, Number(process.env.MINIMUM_PRODUCT_PROFIT || 20));

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  await connection.beginTransaction();
  const [rows] = await connection.query(`SELECT p.id,p.status,p.review_reason,p.selling_price,p.minimum_profit,
      o.id AS offer_id,o.current_cost,o.original_displayed_price,o.promotion_end_at,
      s.minimum_profit AS global_minimum_profit,s.standard_markup_percent
    FROM products p
    JOIN supplier_offers o ON o.id=(SELECT latest.id FROM supplier_offers latest WHERE latest.product_id=p.id ORDER BY latest.last_checked_at DESC,latest.id DESC LIMIT 1)
    JOIN pricing_settings s ON s.id=1
    WHERE p.deleted_at IS NULL AND o.current_cost>0
    FOR UPDATE`);

  const adjustments = (rows as Record<string, unknown>[]).flatMap((row) => {
    const currentPrice = Number(row.selling_price);
    const cost = Number(row.current_cost);
    const minimumProfit = Math.max(MINIMUM_PROFIT, Number(row.minimum_profit ?? row.global_minimum_profit));
    const target = profitProtectedSellingPrice({
      cost,
      originalPrice: row.original_displayed_price == null ? null : Number(row.original_displayed_price),
      promotionEndAt: row.promotion_end_at as Date | null,
    }, Math.max(5, Number(row.standard_markup_percent)), minimumProfit);
    if (Math.abs(currentPrice - target.sellingPrice) <= 0.001) return [];
    return [{ id: Number(row.id), offerId: Number(row.offer_id), cost, oldPrice: currentPrice, newPrice: target.sellingPrice, status: String(row.status), salePricingApplied: target.salePricingApplied }];
  });

  const [restorableRows] = await connection.query(`SELECT COUNT(*) AS count FROM products
    WHERE deleted_at IS NULL AND status='paused' AND review_reason='estimated_profit_below_R10'`);
  const restorableCount = Number((restorableRows as { count: number }[])[0]?.count || 0);
  const summary = {
    mode: APPLY ? 'applied' : 'dry-run',
    minimumProductProfit: MINIMUM_PROFIT,
    regularMarkupPercent: Math.max(5, Number((rows as Record<string, unknown>[])[0]?.standard_markup_percent ?? 5)),
    productsChecked: rows.length,
    pricesToChange: adjustments.length,
    salePricesToChange: adjustments.filter((item) => item.salePricingApplied).length,
    previouslyPausedToRestore: restorableCount,
    largestIncrease: adjustments.length ? Math.max(0, ...adjustments.map((item) => item.newPrice - item.oldPrice)).toFixed(2) : '0.00',
    largestDecrease: adjustments.length ? Math.min(0, ...adjustments.map((item) => item.newPrice - item.oldPrice)).toFixed(2) : '0.00',
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
      SELECT product_id,offer_id,supplier_cost,new_price,CONCAT('Changed from R',FORMAT(old_price,2),' to enforce R',FORMAT(?,2),' product profit, configured regular markup, or 50% of a valid active supplier discount; delivery excluded')
      FROM product_margin_adjustments`, [MINIMUM_PROFIT]);
    const [updateResult] = await connection.query(`UPDATE products p JOIN product_margin_adjustments adjustment ON adjustment.product_id=p.id
      SET p.selling_price=adjustment.new_price`);

    const [adminRows] = await connection.query("SELECT id FROM admins WHERE role='admin' ORDER BY id LIMIT 1");
    const adminId = (adminRows as { id: number }[])[0]?.id;
    if (restorableCount && !adminId) throw new Error('No administrator is available to own restoration audit records');
    let restored = 0;
    if (restorableCount) {
      const [reviewResult] = await connection.execute(`INSERT INTO product_reviews (product_id,admin_id,previous_status,decision,checklist,notes)
        SELECT id,?,'paused','published',JSON_OBJECT('minimumProfitChecked',TRUE,'minimumMarginChecked',TRUE),
          'Restored after confirming the current product-only profit and pricing guardrails; customer delivery is excluded from product profit.'
        FROM products WHERE deleted_at IS NULL AND status='paused' AND review_reason='estimated_profit_below_R10'`, [adminId]);
      const [restoreResult] = await connection.query(`UPDATE products SET status='published',review_reason=NULL
        WHERE deleted_at IS NULL AND status='paused' AND review_reason='estimated_profit_below_R10'`);
      if (reviewResult.affectedRows !== restoreResult.affectedRows) throw new Error('Restoration audit count mismatch');
      restored = restoreResult.affectedRows;
    }

    await connection.query(`UPDATE pricing_settings SET minimum_profit=GREATEST(minimum_profit,?),standard_markup_percent=GREATEST(standard_markup_percent,5) WHERE id=1`, [MINIMUM_PROFIT]);
    const [verificationRows] = await connection.query(`SELECT COUNT(*) AS checked,
        SUM((p.selling_price-o.current_cost)<GREATEST(?,COALESCE(p.minimum_profit,s.minimum_profit))) AS below_profit_floor,
        SUM(CASE WHEN o.original_displayed_price IS NOT NULL AND o.original_displayed_price>o.current_cost AND o.current_cost>=o.original_displayed_price*0.4 AND (o.promotion_end_at IS NULL OR o.promotion_end_at>UTC_TIMESTAMP()) THEN 0 ELSE p.selling_price+0.005<CEIL(GREATEST(ROUND(o.current_cost*(1+s.standard_markup_percent/100),2),o.current_cost+GREATEST(?,COALESCE(p.minimum_profit,s.minimum_profit)))*100)/100 END) AS below_regular_markup_floor,
        SUM(CASE WHEN o.original_displayed_price IS NOT NULL AND o.original_displayed_price>o.current_cost AND o.current_cost>=o.original_displayed_price*0.4 AND (o.promotion_end_at IS NULL OR o.promotion_end_at>UTC_TIMESTAMP()) THEN p.selling_price+0.005<CEIL(GREATEST(ROUND(o.current_cost+(o.original_displayed_price-o.current_cost)/2,2),o.current_cost+GREATEST(?,COALESCE(p.minimum_profit,s.minimum_profit)))*100)/100 ELSE 0 END) AS below_sale_discount_share
      FROM products p
      JOIN supplier_offers o ON o.id=(SELECT latest.id FROM supplier_offers latest WHERE latest.product_id=p.id ORDER BY latest.last_checked_at DESC,latest.id DESC LIMIT 1)
      JOIN pricing_settings s ON s.id=1 WHERE p.deleted_at IS NULL AND o.current_cost>0`, [MINIMUM_PROFIT, MINIMUM_PROFIT, MINIMUM_PROFIT]);
    const verification = (verificationRows as Record<string, unknown>[])[0];
    if (Number(verification.below_profit_floor) || Number(verification.below_regular_markup_floor) || Number(verification.below_sale_discount_share) || updateResult.affectedRows !== adjustments.length || historyResult.affectedRows !== adjustments.length) {
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
