export type ProfitInput = {
  productRevenue: number;
  customerDeliveryCharged: number;
  supplierProductCost: number;
  supplierDelivery: number;
  customerDeliveryCost: number;
  packaging: number;
  paymentFees: number;
  advertisingCost: number;
};

export type MatchableProduct = { barcode?: string | null; brand: string; model: string; packSize: string };
export type SupplierSignal = { stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown'; lastCheckedAt: Date; promotionEndAt?: Date | null; currentCost: number; previousCost?: number | null };

export const calculateProfit = (input: ProfitInput) => input.productRevenue + input.customerDeliveryCharged - input.supplierProductCost - input.supplierDelivery - input.customerDeliveryCost - input.packaging - input.paymentFees - input.advertisingCost;
export const calculateMargin = (profit: number, revenue: number) => revenue <= 0 ? 0 : profit / revenue * 100;
export const customerDeliveryCharge = (productRevenue: number, threshold = 999, standardCharge = 89) => productRevenue >= threshold ? 0 : standardCharge;
export const normalise = (value: string) => value.trim().toLocaleLowerCase('en-ZA').replace(/\s+/g, ' ');

export type SourcePrice = { cost: number; originalPrice?: number | null; promotionEndAt?: Date | string | null };
export function recommendedSellingPrice(source: SourcePrice, standardMarkupPercent = 7, now = new Date()) {
  if (!Number.isFinite(source.cost) || source.cost <= 0) throw new Error('A positive supplier price is required');
  if (!Number.isFinite(standardMarkupPercent) || standardMarkupPercent < 5 || standardMarkupPercent > 10) throw new Error('Standard markup must be between 5% and 10%');
  const original = source.originalPrice == null ? null : Number(source.originalPrice);
  const end = source.promotionEndAt ? new Date(source.promotionEndAt) : null;
  const promotionActive = original != null && Number.isFinite(original) && original > source.cost && (!end || end.getTime() > now.getTime());
  const regular = Math.round(source.cost * (1 + standardMarkupPercent / 100) * 100) / 100;
  const sellingPrice = promotionActive ? Math.min(Math.round(source.cost * 1.15 * 100) / 100, Math.round(original! * 100) / 100 - 0.01) : regular;
  return { sellingPrice: Math.round(sellingPrice * 100) / 100, promotionActive };
}

export function isExactProductMatch(a: MatchableProduct, b: MatchableProduct) {
  if (a.barcode && b.barcode) return normalise(a.barcode) === normalise(b.barcode);
  return normalise(a.brand) === normalise(b.brand) && normalise(a.model) === normalise(b.model) && normalise(a.packSize) === normalise(b.packSize);
}

export function offerReviewReason(signal: SupplierSignal, now = new Date(), staleHours = 24): string | null {
  if (signal.stockStatus === 'out_of_stock') return 'supplier_out_of_stock';
  if (signal.stockStatus === 'unknown') return 'stock_uncertain';
  if (signal.promotionEndAt && signal.promotionEndAt.getTime() <= now.getTime()) return 'promotion_expired';
  if (now.getTime() - signal.lastCheckedAt.getTime() > staleHours * 3_600_000) return 'supplier_data_stale';
  if (signal.previousCost != null && signal.currentCost > signal.previousCost) return 'supplier_price_increased';
  return null;
}

export function passesPricingRules(input: ProfitInput, minimumProfit: number, minimumMarginPercent: number) {
  const profit = calculateProfit(input);
  return { profit, margin: calculateMargin(profit, input.productRevenue), passes: profit >= minimumProfit && calculateMargin(profit, input.productRevenue) >= minimumMarginPercent };
}
