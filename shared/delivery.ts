export type FulfilmentType = 'store_stock' | 'warehouse' | 'online_only' | 'unknown';

export type DeliveryEstimate = {
  fulfilmentType: FulfilmentType;
  fulfilmentLabel: string;
  supplierMinDays: number;
  supplierMaxDays: number;
  processingDays: number;
  courierMinDays: number;
  courierMaxDays: number;
  totalMinDays: number;
  totalMaxDays: number;
  summary: string;
};

const provinceCourierDays = (province?: string) => province === 'Gauteng' ? [1, 2] : ['Western Cape', 'KwaZulu-Natal'].includes(province || '') ? [2, 4] : [3, 5];

export function inferFulfilmentType(text = ''): FulfilmentType {
  const value = text.toLowerCase();
  if (/online\s*only|available\s*online\s*only|delivery\s*only/.test(value)) return 'online_only';
  if (/in[- ]store|store\s*stock|collect\s*(in|from)\s*store|click\s*(and|&)\s*collect/.test(value)) return 'store_stock';
  if (/warehouse|dispatch(ed)?\s*from/.test(value)) return 'warehouse';
  return 'unknown';
}

export function deliveryEstimate(input: { retailer?: string | null; fulfilmentType?: string | null; stockStatus?: string | null; province?: string }): DeliveryEstimate {
  const retailer = String(input.retailer || '').toLowerCase();
  const type = (['store_stock', 'warehouse', 'online_only'].includes(String(input.fulfilmentType)) ? input.fulfilmentType : 'unknown') as FulfilmentType;
  let supplier: [number, number];
  if (type === 'store_stock') supplier = [0, 1];
  else if (type === 'warehouse') supplier = [1, 3];
  else if (type === 'online_only') supplier = retailer.includes('game') || retailer.includes('makro') ? [3, 6] : [3, 7];
  else supplier = retailer.includes('game') || retailer.includes('makro') ? [2, 5] : [2, 6];
  if (input.stockStatus === 'low_stock') supplier[1] += 1;
  const courier = provinceCourierDays(input.province);
  const processingDays = 1;
  const labels: Record<FulfilmentType, string> = { store_stock: 'Available from store stock', warehouse: 'Preparing your item for dispatch', online_only: 'Online item being prepared', unknown: 'Delivery timing being confirmed' };
  const totalMinDays = supplier[0] + processingDays + courier[0];
  const totalMaxDays = supplier[1] + processingDays + courier[1];
  return { fulfilmentType: type, fulfilmentLabel: labels[type], supplierMinDays: supplier[0], supplierMaxDays: supplier[1], processingDays, courierMinDays: courier[0], courierMaxDays: courier[1], totalMinDays, totalMaxDays, summary: `${totalMinDays}–${totalMaxDays} business days` };
}

export function addBusinessDays(start: Date, days: number) {
  const result = new Date(start);
  let remaining = Math.max(0, Math.ceil(days));
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return result;
}
