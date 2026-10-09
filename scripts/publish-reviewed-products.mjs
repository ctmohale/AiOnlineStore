import mysql from 'mysql2/promise';

const MINIMUM_PROFIT = Math.max(20, Number(process.env.MINIMUM_PUBLICATION_PROFIT || 20));
const MINIMUM_MARGIN_PERCENT = Math.max(5, Number(process.env.MINIMUM_PUBLICATION_MARGIN_PERCENT || 5));
const APPLY = process.env.PUBLISH_LIVE === 'true';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!Number.isFinite(MINIMUM_PROFIT)) throw new Error('MINIMUM_PUBLICATION_PROFIT must be a number');

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const batchReference = `bulk-profit-approval-${new Date().toISOString()}`;

const profitExpression = `(p.selling_price-o.current_cost)`;

const promotionExpression = `(o.original_displayed_price IS NOT NULL
    AND o.original_displayed_price > o.current_cost
    AND (o.promotion_end_at IS NULL OR o.promotion_end_at > UTC_TIMESTAMP()))`;
const expectedPriceExpression = `(CASE
  WHEN ${promotionExpression}
  THEN ROUND(o.current_cost+(o.original_displayed_price-o.current_cost)/2,2)
  ELSE ROUND(o.current_cost * (1 + s.standard_markup_percent / 100), 2)
END)`;
const protectedPriceExpression = `(CASE WHEN ${promotionExpression}
  THEN CEIL(GREATEST(${expectedPriceExpression},o.current_cost+GREATEST(?,COALESCE(p.minimum_profit,s.minimum_profit)))*100)/100
  ELSE CEIL(GREATEST(${expectedPriceExpression},o.current_cost+GREATEST(?,COALESCE(p.minimum_profit,s.minimum_profit)),o.current_cost/(1-GREATEST(?,s.minimum_margin_percent)/100))*100)/100
END)`;

try {
  await connection.beginTransaction();
  await connection.query(`CREATE TEMPORARY TABLE eligible_product_publication (
    product_id BIGINT UNSIGNED PRIMARY KEY,
    retailer VARCHAR(120) NOT NULL,
    estimated_profit DECIMAL(12,2) NOT NULL
  )`);

  await connection.execute(`INSERT INTO eligible_product_publication (product_id, retailer, estimated_profit)
    SELECT p.id, o.retailer, ROUND(${profitExpression}, 2)
    FROM products p
    JOIN supplier_offers o ON o.id=(
      SELECT latest.id FROM supplier_offers latest
      WHERE latest.product_id=p.id
      ORDER BY latest.last_checked_at DESC,latest.id DESC LIMIT 1
    )
    JOIN pricing_settings s ON s.id=1
    WHERE p.status='pending_review'
      AND p.deleted_at IS NULL
      AND TRIM(p.title)<>''
      AND TRIM(p.category)<>''
      AND (TRIM(p.model)<>'' OR TRIM(p.pack_size)<>'')
      AND p.gallery_image_count>=1
      AND EXISTS (
        SELECT 1 FROM product_images image
        WHERE image.product_id=p.id AND image.sort_order=0 AND image.url LIKE 'https://%'
      )
      AND TRIM(o.source_url)<>''
      AND o.current_cost>0
      AND o.price_verified=TRUE
      AND o.stock_status IN ('in_stock','low_stock')
      AND o.last_checked_at IS NOT NULL
      AND o.last_checked_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL COALESCE(s.supplier_stale_hours,24) HOUR)
      AND (o.promotion_end_at IS NULL OR o.promotion_end_at>UTC_TIMESTAMP())
      AND ABS(p.selling_price-${protectedPriceExpression})<=0.001
      AND ${profitExpression}>=GREATEST(?,COALESCE(p.minimum_profit,s.minimum_profit))
      AND (${promotionExpression} OR (${profitExpression}/p.selling_price*100)>=GREATEST(?,s.minimum_margin_percent))`, [MINIMUM_PROFIT, MINIMUM_PROFIT, MINIMUM_MARGIN_PERCENT, MINIMUM_PROFIT, MINIMUM_MARGIN_PERCENT]);

  const [summaryRows] = await connection.query(`SELECT COUNT(*) AS eligible_count,
      ROUND(MIN(estimated_profit),2) AS minimum_profit,
      ROUND(MAX(estimated_profit),2) AS maximum_profit,
      ROUND(AVG(estimated_profit),2) AS average_profit
    FROM eligible_product_publication`);
  const [retailerRows] = await connection.query(`SELECT retailer,COUNT(*) AS eligible_count,
      ROUND(MIN(estimated_profit),2) AS minimum_profit
    FROM eligible_product_publication GROUP BY retailer ORDER BY eligible_count DESC`);
  const summary = summaryRows[0];

  if (!APPLY) {
    await connection.rollback();
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', minimumPublicationProfit: MINIMUM_PROFIT, minimumPublicationMarginPercent: MINIMUM_MARGIN_PERCENT, ...summary, retailers: retailerRows }, null, 2)}\n`);
    process.exitCode = 0;
  } else {
    const [adminRows] = await connection.query("SELECT id,email FROM admins WHERE role='admin' ORDER BY id LIMIT 1");
    const admin = adminRows[0];
    if (!admin) throw new Error('No administrator is available to own the publication audit records');

    const checklist = JSON.stringify({
      exactProductMatch: true,
      supplierPriceChecked: true,
      stockChecked: true,
      promotionDatesChecked: true,
      imagesChecked: true,
      descriptionChecked: true,
      minimumProfitChecked: true,
    });

    const [reviewResult] = await connection.execute(`INSERT INTO product_reviews
      (product_id,admin_id,previous_status,decision,checklist,notes)
      SELECT eligible.product_id,?,'pending_review','published',?,CONCAT(?,
        '; automated publication gates passed; estimated profit R',
        FORMAT(eligible.estimated_profit,2),' product profit (minimum R',FORMAT(?,2),'; regular minimum ',FORMAT(?,2),'% or 50% of an active supplier discount; delivery excluded)')
      FROM eligible_product_publication eligible
      JOIN products p ON p.id=eligible.product_id AND p.status='pending_review'`,
    [admin.id, checklist, batchReference, MINIMUM_PROFIT, MINIMUM_MARGIN_PERCENT]);

    const [updateResult] = await connection.query(`UPDATE products p
      JOIN eligible_product_publication eligible ON eligible.product_id=p.id
      SET p.status='published',p.review_reason=NULL
      WHERE p.status='pending_review' AND p.deleted_at IS NULL`);

    if (updateResult.affectedRows !== Number(summary.eligible_count) || reviewResult.affectedRows !== Number(summary.eligible_count)) {
      throw new Error(`Approval count mismatch: eligible=${summary.eligible_count}, reviews=${reviewResult.affectedRows}, published=${updateResult.affectedRows}`);
    }

    const [verificationRows] = await connection.query(`SELECT
        COUNT(*) AS checked_count,
        SUM(p.status<>'published') AS wrong_status_count,
        ROUND(MIN(eligible.estimated_profit),2) AS minimum_profit
      FROM eligible_product_publication eligible JOIN products p ON p.id=eligible.product_id`);
    const verification = verificationRows[0];
    if (Number(verification.wrong_status_count) !== 0 || Number(verification.checked_count) !== Number(summary.eligible_count)) {
      throw new Error('Post-publication verification failed');
    }

    await connection.commit();
    process.stdout.write(`${JSON.stringify({
      mode: 'applied',
      batchReference,
      approvingAdmin: admin.email,
      minimumPublicationProfit: MINIMUM_PROFIT,
      minimumPublicationMarginPercent: MINIMUM_MARGIN_PERCENT,
      ...summary,
      retailers: retailerRows,
      auditRowsCreated: reviewResult.affectedRows,
      productsPublished: updateResult.affectedRows,
      verification,
    }, null, 2)}\n`);
  }
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
