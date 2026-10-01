import { z } from 'zod';
import type { CandidateProduct, SourceAdapter } from './types.js';

const feedSchema = z.array(z.object({ title: z.string(), brand: z.string(), model: z.string(), barcode: z.string().optional(), packSize: z.string(), url: z.url(), price: z.number().positive(), originalDisplayedPrice: z.number().positive().optional(), saleEndDate: z.string().optional(), stockStatus: z.enum(['in_stock','low_stock','out_of_stock','unknown']) }));

export class PermittedRetailerFeedAdapter implements SourceAdapter {
  readonly name = 'permitted-retailer-feed';
  constructor(private readonly feedUrl: string, private readonly retailer = 'Permitted retailer') {}
  async *collect(): AsyncIterable<CandidateProduct> {
    const response = await fetch(this.feedUrl, { headers: { 'User-Agent': 'MzansiMegaStore/1.0 product-feed-client' }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Retailer feed returned ${response.status}`);
    const rows = feedSchema.parse(await response.json());
    for (const row of rows) yield { ...row, retailer: this.retailer, saleEndDate: row.saleEndDate ? new Date(row.saleEndDate) : undefined, checkedAt: new Date() };
  }
}
