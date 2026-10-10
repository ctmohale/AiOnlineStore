import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { adminProductCreateSchema } from './validation.js';

export const productFileColumns = [
  'id', 'slug', 'title', 'brand', 'model', 'barcode', 'pack_size', 'category', 'description', 'specifications_json',
  'selling_price', 'minimum_profit', 'estimated_customer_delivery_cost', 'delivery_time', 'item_weight_size',
  'internal_review_notes', 'status', 'review_reason', 'image_urls', 'retailer', 'source_url', 'supplier_sku',
  'current_cost', 'original_displayed_price', 'supplier_delivery_cost', 'promotion_start_at', 'promotion_end_at',
  'promotion_end_provided', 'promotion_terms', 'quantity_limit', 'stock_status', 'fulfilment_type', 'fulfilment_signal',
  'last_checked_at', 'source_confidence', 'price_verified', 'price_updated_at', 'price_change_reason', 'created_at', 'updated_at',
] as const;

const csvCell = (value: unknown) => {
  if (value == null) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const jsonObject = (value: unknown) => {
  if (!value) return '{}';
  if (typeof value === 'string') {
    try { return JSON.stringify(JSON.parse(value)); } catch { return '{}'; }
  }
  return JSON.stringify(value);
};

export function productsToCsv(products: Record<string, unknown>[]) {
  const rows = products.map((product) => {
    const images = Array.isArray(product.images)
      ? product.images.map((image) => String((image as Record<string, unknown>).url || '')).filter(Boolean)
      : [];
    const record: Record<string, unknown> = { ...product, specifications_json: jsonObject(product.specifications), image_urls: images.join('\n') };
    return productFileColumns.map((column) => csvCell(record[column])).join(',');
  });
  return `\uFEFF${productFileColumns.join(',')}\r\n${rows.join('\r\n')}\r\n`;
}

const exportRecord = (product: Record<string, unknown>) => {
  const images = Array.isArray(product.images)
    ? product.images.map((image) => String((image as Record<string, unknown>).url || '')).filter(Boolean)
    : [];
  return { ...product, specifications_json: jsonObject(product.specifications), image_urls: images.join('\n') };
};

export async function productsToXlsx(products: Record<string, unknown>[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Mzansi Mega Store';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('Products', { views: [{ state: 'frozen', ySplit: 1 }] });
  worksheet.columns = productFileColumns.map((column) => ({ header: column, key: column, width: Math.min(60, Math.max(14, column.length + 2)) }));
  for (const product of products) {
    const record: Record<string, unknown> = exportRecord(product);
    worksheet.addRow(Object.fromEntries(productFileColumns.map((column) => [column, record[column] instanceof Date ? (record[column] as Date).toISOString() : record[column] ?? ''])));
  }
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173E32' } };
  worksheet.autoFilter = { from: 'A1', to: `${worksheet.getColumn(productFileColumns.length).letter}${worksheet.rowCount}` };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function parseProductXlsx(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const worksheet = workbook.getWorksheet('Products') || workbook.worksheets[0];
  if (!worksheet) throw Object.assign(new Error('The Excel file has no worksheet'), { status: 400 });
  const lines: string[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    for (let column = 1; column <= worksheet.columnCount; column++) {
      const cell = row.getCell(column);
      const value = cell.value instanceof Date ? cell.value.toISOString() : cell.value && typeof cell.value === 'object' && 'result' in cell.value ? cell.value.result : cell.value;
      values.push(csvCell(value ?? ''));
    }
    lines.push(values.join(','));
  });
  return parseProductCsv(lines.join('\r\n'));
}

const blankToNull = (value: unknown) => String(value ?? '').trim() === '' ? null : value;
const money = (value: unknown) => {
  const blank = blankToNull(value);
  if (blank == null) return null;
  const number = Number(blank);
  if (!Number.isFinite(number)) throw new Error(`Expected a number but received “${String(value)}”`);
  return number;
};
const bool = (value: unknown) => ['1', 'true', 'yes', 'y'].includes(String(value ?? '').trim().toLowerCase());
const text = (value: unknown) => String(value ?? '').trim();
const nullableText = (value: unknown) => text(value) || null;
const date = (value: unknown) => {
  const item = text(value);
  if (!item) return null;
  const parsed = new Date(item);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Expected a date but received “${item}”`);
  return parsed;
};

export type ImportedProductRow = {
  rowNumber: number;
  id: number | null;
  status: 'draft' | 'pending_review' | 'published' | 'paused';
  reviewReason: string | null;
  imageUrls: string[];
  input: ReturnType<typeof adminProductCreateSchema.parse>;
};

export function parseProductCsv(csv: string): ImportedProductRow[] {
  let records: Record<string, string>[];
  try {
    records = parse(csv, { bom: true, columns: true, skip_empty_lines: true, trim: true, relax_quotes: false, max_record_size: 2_000_000 });
  } catch (error) {
    throw Object.assign(new Error(`The CSV file could not be read: ${error instanceof Error ? error.message : 'invalid CSV'}`), { status: 400 });
  }
  if (records.length > 10_000) throw Object.assign(new Error('A product import can contain at most 10,000 rows'), { status: 413 });
  if (!records.length) throw Object.assign(new Error('The product file contains no data rows'), { status: 400 });
  const headers = Object.keys(records[0]);
  for (const required of ['title', 'category', 'selling_price']) if (!headers.includes(required)) throw Object.assign(new Error(`The product file is missing the “${required}” column`), { status: 400 });
  const seenIds = new Set<number>();

  return records.map((row, index) => {
    const rowNumber = index + 2;
    try {
      const id = text(row.id) ? Number(row.id) : null;
      if (id != null && (!Number.isSafeInteger(id) || id < 1)) throw new Error('id must be a positive whole number or blank');
      if (id != null && seenIds.has(id)) throw new Error(`product id ${id} appears more than once`);
      if (id != null) seenIds.add(id);
      let specifications: Record<string, string> = {};
      if (text(row.specifications_json)) {
        const parsed = JSON.parse(row.specifications_json);
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('specifications_json must be a JSON object');
        specifications = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? '')]));
      }
      const imageUrls = [...new Set(text(row.image_urls).split(/\r?\n/).map((value) => value.trim()).filter(Boolean))];
      const requestedStatus = text(row.status) || 'draft';
      if (!['draft', 'pending_review', 'published', 'paused'].includes(requestedStatus)) throw new Error('status must be draft, pending_review, published, or paused');
      const hasSupplier = ['retailer', 'source_url', 'supplier_sku', 'current_cost', 'original_displayed_price', 'supplier_delivery_cost', 'last_checked_at']
        .some((key) => text(row[key]));
      const supplier = hasSupplier ? {
        retailer: nullableText(row.retailer), sourceUrl: nullableText(row.source_url), supplierSku: nullableText(row.supplier_sku),
        currentCost: money(row.current_cost), originalDisplayedPrice: money(row.original_displayed_price), supplierDeliveryCost: money(row.supplier_delivery_cost) ?? 0,
        promotionStartAt: date(row.promotion_start_at), promotionEndAt: date(row.promotion_end_at), promotionEndProvided: bool(row.promotion_end_provided),
        promotionTerms: nullableText(row.promotion_terms), quantityLimit: nullableText(row.quantity_limit),
        stockStatus: text(row.stock_status) || 'unknown', fulfilmentType: text(row.fulfilment_type) || 'unknown', fulfilmentSignal: nullableText(row.fulfilment_signal),
        lastCheckedAt: date(row.last_checked_at), sourceConfidence: text(row.source_confidence) || 'low', supplierPriceVerified: bool(row.price_verified),
        priceUpdatedAt: date(row.price_updated_at), priceChangeReason: nullableText(row.price_change_reason),
      } : undefined;
      const input = adminProductCreateSchema.parse({
        title: text(row.title), brand: text(row.brand), model: text(row.model), barcode: nullableText(row.barcode), packSize: text(row.pack_size),
        category: text(row.category), description: text(row.description), specifications, imageUrls,
        sellingPrice: money(row.selling_price), minimumProfit: money(row.minimum_profit), estimatedCustomerDeliveryCost: money(row.estimated_customer_delivery_cost),
        deliveryTime: nullableText(row.delivery_time), itemWeightSize: nullableText(row.item_weight_size), reviewNotes: nullableText(row.internal_review_notes),
        status: requestedStatus === 'published' ? 'pending_review' : requestedStatus, supplier,
      });
      return { rowNumber, id, status: requestedStatus as ImportedProductRow['status'], reviewReason: nullableText(row.review_reason), imageUrls, input };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid product data';
      throw Object.assign(new Error(`Row ${rowNumber}: ${message}`), { status: 422 });
    }
  });
}
