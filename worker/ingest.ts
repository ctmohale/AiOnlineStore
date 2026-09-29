import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { isExactProductMatch, offerReviewReason } from '../shared/domain.js';
import { pool, withTransaction } from '../server/db/pool.js';
import type { CandidateProduct, SourceAdapter } from './adapters/types.js';

export async function ingest(adapter: SourceAdapter) {
  if (!pool) throw new Error('DATABASE_URL is required for ingestion');
  const [runResult] = await pool.execute("INSERT INTO ingestion_runs (adapter,status,started_at) VALUES (?,'running',UTC_TIMESTAMP())", [adapter.name]);
  const runId = (runResult as ResultSetHeader).insertId;
  let seen = 0, created = 0, flagged = 0;
  const errors: string[] = [];
  try {
    for await (const candidate of adapter.collect()) {
      seen++;
      try {
        const result = await upsertCandidate(candidate);
        created += result.created ? 1 : 0;
        flagged += result.flagged ? 1 : 0;
      } catch (error) { flagged++; errors.push(`Row ${seen}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    await pool.execute("UPDATE ingestion_runs SET status='completed',records_seen=?,records_created=?,records_flagged=?,error_log=?,completed_at=UTC_TIMESTAMP() WHERE id=?", [seen, created, flagged, JSON.stringify(errors.slice(0, 100)), runId]);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    await pool.execute("UPDATE ingestion_runs SET status='failed',records_seen=?,records_created=?,records_flagged=?,error_log=?,completed_at=UTC_TIMESTAMP() WHERE id=?", [seen, created, flagged, JSON.stringify(errors.slice(0, 100)), runId]);
    throw error;
  }
  return { runId, seen, created, flagged, errors };
}

async function upsertCandidate(candidate: CandidateProduct) {
  return withTransaction(async (connection) => {
    const [matches] = candidate.barcode
      ? await connection.execute('SELECT * FROM products WHERE barcode=? LIMIT 2 FOR UPDATE', [candidate.barcode])
      : await connection.execute('SELECT * FROM products WHERE LOWER(brand)=LOWER(?) AND LOWER(model)=LOWER(?) AND LOWER(pack_size)=LOWER(?) LIMIT 2 FOR UPDATE', [candidate.brand, candidate.model, candidate.packSize]);
    const rows = matches as (RowDataPacket & { id: number; barcode: string | null; brand: string; model: string; pack_size: string; selling_price: number })[];
    const exact = rows.find((row) => isExactProductMatch({ barcode: row.barcode, brand: row.brand, model: row.model, packSize: row.pack_size }, candidate));
    let productId = exact?.id;
    let created = false;
    if (!productId) {
      const slugBase = `${candidate.brand}-${candidate.model}-${candidate.packSize}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const [result] = await connection.execute("INSERT INTO products (slug,title,brand,model,barcode,pack_size,category,description,specifications,selling_price,status,review_reason) VALUES (?,?,?,?,?,?,'Uncategorised','Description pending rights-cleared authoring',JSON_OBJECT(),?,'pending_review','New candidate requires human review')", [`${slugBase}-${Date.now().toString(36)}`, candidate.title, candidate.brand, candidate.model, candidate.barcode || null, candidate.packSize, Math.ceil(candidate.price * 1.25)]);
      productId = (result as ResultSetHeader).insertId; created = true;
    }
    const [previousRows] = await connection.execute('SELECT id,current_cost FROM supplier_offers WHERE product_id=? AND retailer=? ORDER BY last_checked_at DESC LIMIT 1', [productId, candidate.retailer]);
    const previous = (previousRows as (RowDataPacket & { id: number; current_cost: number })[])[0];
    const reviewReason = offerReviewReason({ stockStatus: candidate.stockStatus, currentCost: candidate.price, previousCost: previous?.current_cost, lastCheckedAt: candidate.checkedAt, promotionEndAt: candidate.saleEndDate });
    const [offerResult] = await connection.execute('INSERT INTO supplier_offers (product_id,retailer,source_url,brand,model,barcode,pack_size,current_cost,original_displayed_price,promotion_end_at,promotion_end_provided,stock_status,last_checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [productId, candidate.retailer, candidate.url, candidate.brand, candidate.model, candidate.barcode || null, candidate.packSize, candidate.price, candidate.originalDisplayedPrice || null, candidate.saleEndDate || null, Boolean(candidate.saleEndDate), candidate.stockStatus, candidate.checkedAt]);
    if (previous && Number(previous.current_cost) !== candidate.price) await connection.execute('INSERT INTO price_history (product_id,supplier_offer_id,supplier_cost,selling_price,reason) SELECT ?,?,?,selling_price,? FROM products WHERE id=?', [productId, (offerResult as ResultSetHeader).insertId, candidate.price, `Supplier cost changed from ${previous.current_cost} to ${candidate.price}`, productId]);
    if (reviewReason) await connection.execute("UPDATE products SET status='pending_review',review_reason=? WHERE id=?", [reviewReason, productId]);
    return { created, flagged: Boolean(reviewReason) || created };
  });
}
