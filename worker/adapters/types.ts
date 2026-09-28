export type CandidateProduct = {
  title: string; brand: string; model: string; barcode?: string; packSize: string; retailer: string; url: string;
  price: number; originalDisplayedPrice?: number; saleEndDate?: Date; stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown'; checkedAt: Date;
};

export interface SourceAdapter {
  readonly name: string;
  collect(): AsyncIterable<CandidateProduct>;
}
