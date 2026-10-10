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
export type SupplierIdentity = MatchableProduct & { title: string; supplierSku?: string | null };
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
  const promotionActive = original != null && Number.isFinite(original) && original > source.cost && source.cost >= original * 0.4 && (!end || end.getTime() > now.getTime());
  const regular = Math.round(source.cost * (1 + standardMarkupPercent / 100) * 100) / 100;
  // A supplier promotion is not permission to inflate the markup. Keep the
  // configured markup and cap the result below the verified comparison price.
  const sellingPrice = promotionActive ? Math.min(regular, Math.floor((original! - 0.01 + Number.EPSILON) * 100) / 100) : regular;
  return { sellingPrice, promotionActive };
}

export function profitProtectedSellingPrice(source: SourcePrice, standardMarkupPercent = 7, minimumProfit = 20, now = new Date()) {
  if (!Number.isFinite(minimumProfit) || minimumProfit < 0) throw new Error('Minimum profit must be zero or greater');
  const sourcePrice = recommendedSellingPrice(source, standardMarkupPercent, now);
  const cost = Number(source.cost);
  const minimumPrice = Math.max(sourcePrice.sellingPrice, cost + minimumProfit);
  const sellingPrice = Math.ceil((minimumPrice - Number.EPSILON) * 100) / 100;
  const original = source.originalPrice == null ? null : Number(source.originalPrice);
  return { sellingPrice, promotionActive: sourcePrice.promotionActive && original != null && sellingPrice < original, salePricingApplied: sourcePrice.promotionActive };
}

export function isExactProductMatch(a: MatchableProduct, b: MatchableProduct) {
  if (a.barcode && b.barcode) return normalise(a.barcode) === normalise(b.barcode);
  return normalise(a.brand) === normalise(b.brand) && normalise(a.model) === normalise(b.model) && normalise(a.packSize) === normalise(b.packSize);
}

const meaningful = (value: string | null | undefined) => {
  const normalised = normalise(String(value || '')).replace(/[^a-z0-9]+/g, ' ').trim();
  return normalised && !['n a', 'na', 'none', 'unknown', '1 unit'].includes(normalised) ? normalised : '';
};

const numberTokens = (value: string) => [...value.matchAll(/\b\d+(?:\.\d+)?\b/g)].map((match) => match[0]);

export function isSupplierIdentityMatch(stored: SupplierIdentity, imported: SupplierIdentity) {
  const storedBarcode = meaningful(stored.barcode);
  const importedBarcode = meaningful(imported.barcode);
  if (storedBarcode && importedBarcode) return storedBarcode === importedBarcode;

  const storedSku = meaningful(stored.supplierSku);
  const importedSku = meaningful(imported.supplierSku);
  if (storedSku && importedSku) return storedSku === importedSku;

  const storedBrand = meaningful(stored.brand);
  const importedBrand = meaningful(imported.brand);
  if (storedBrand && importedBrand && storedBrand !== importedBrand) return false;

  const storedModel = meaningful(stored.model);
  const importedModel = meaningful(imported.model);
  if (storedModel && importedModel && storedModel !== importedModel) return false;

  const storedTitle = meaningful(stored.title);
  const importedTitle = meaningful(imported.title);
  if (!storedTitle || !importedTitle) return false;
  if (storedTitle === importedTitle) return true;

  const storedNumbers = numberTokens(storedTitle);
  const importedNumbers = numberTokens(importedTitle);
  if (storedNumbers.join('|') !== importedNumbers.join('|')) return false;
  const storedWords = new Set(storedTitle.split(' ').filter((word) => word.length > 1));
  const importedWords = new Set(importedTitle.split(' ').filter((word) => word.length > 1));
  const overlap = [...storedWords].filter((word) => importedWords.has(word)).length;
  return overlap / Math.max(storedWords.size, importedWords.size, 1) >= 0.85;
}

export function hasConfirmedSupplierIdentityConflict(stored: SupplierIdentity, imported: SupplierIdentity) {
  const storedBarcode = meaningful(stored.barcode);
  const importedBarcode = meaningful(imported.barcode);
  if (storedBarcode && importedBarcode) return storedBarcode !== importedBarcode;

  const storedSku = meaningful(stored.supplierSku);
  const importedSku = meaningful(imported.supplierSku);
  return Boolean(storedSku && importedSku && storedSku !== importedSku);
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
