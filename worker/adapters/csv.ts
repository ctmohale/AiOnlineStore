import fs from 'node:fs';
import { parse } from 'csv-parse';
import { z } from 'zod';
import type { CandidateProduct, SourceAdapter } from './types.js';

const rowSchema = z.object({
  title: z.string().min(2), brand: z.string().min(1), model: z.string().min(1), barcode: z.string().optional().default(''), pack_size: z.string().min(1), retailer: z.string().min(1), url: z.url(), price: z.coerce.number().positive(), original_displayed_price: z.union([z.literal(''), z.coerce.number().positive()]).optional(), sale_end_date: z.string().optional().default(''), stock_status: z.enum(['in_stock', 'low_stock', 'out_of_stock', 'unknown']),
});

export class CsvAdapter implements SourceAdapter {
  readonly name = 'csv';
  constructor(private readonly filePath: string) {}
  async *collect(): AsyncIterable<CandidateProduct> {
    const parser = fs.createReadStream(this.filePath).pipe(parse({ columns: true, bom: true, trim: true, skip_empty_lines: true }));
    for await (const raw of parser) {
      const row = rowSchema.parse(raw);
      yield { title: row.title, brand: row.brand, model: row.model, barcode: row.barcode || undefined, packSize: row.pack_size, retailer: row.retailer, url: row.url, price: row.price, originalDisplayedPrice: row.original_displayed_price === '' ? undefined : row.original_displayed_price, saleEndDate: row.sale_end_date ? new Date(row.sale_end_date) : undefined, stockStatus: row.stock_status, checkedAt: new Date() };
    }
  }
}
