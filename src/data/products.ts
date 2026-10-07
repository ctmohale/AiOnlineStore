import { sanitizePublicProductName, sanitizePublicProductSpecs, sanitizePublicProductText } from '../../shared/public-product.js';

export type Product = {
  unitsSold?: number;
  recentUnits?: number;
  trendingUnits?: number;
  id: number;
  slug: string;
  name: string;
  brand: string;
  model: string;
  packSize: string;
  category: string;
  price: number;
  compareAt?: number;
  promotionStartAt?: string;
  promotionEndAt?: string;
  image: string;
  images?: { url: string; altText: string }[];
  accent: string;
  badge?: string;
  short: string;
  description: string;
  specs: Record<string, string>;
  status: 'draft' | 'pending_review' | 'published' | 'paused' | 'unavailable';
  retailer?: string;
  stockStatus?: string;
  fulfilmentType?: 'store_stock' | 'warehouse' | 'online_only' | 'unknown';
  fulfilmentSignal?: string;
  supplierCheckRequired?: boolean;
  supplierLastCheckedAt?: string;
  deliveryEstimate?: { fulfilmentLabel: string; supplierMinDays: number; supplierMaxDays: number; processingDays: number; courierMinDays: number; courierMaxDays: number; totalMinDays: number; totalMaxDays: number; summary: string };
};

export type PublicProductRow = {
  units_sold?: number; recent_units?: number; trending_units?: number;
  id: number; slug: string; title: string; brand: string; model: string; pack_size: string; category: string;
  description: string; specifications: Record<string, string> | string | null; selling_price: number;
  promotion_start_at?: string | null; promotion_end_at?: string | null;
  original_displayed_price?: number | null; image_url: string | null;
  images?: { url: string; alt_text?: string; sort_order?: number }[];
  retailer?: string; stock_status?: string; fulfilment_type?: NonNullable<Product['fulfilmentType']>; fulfilment_signal?: string | null;
  supplier_check_required?: boolean | number; last_checked_at?: string | null;
  delivery_estimate?: NonNullable<Product['deliveryEstimate']>;
};

const accents = ['#f3e9df', '#dfeff0', '#efe1cd', '#e6eee9', '#f1e6e2'];
const parseSpecs = (value: PublicProductRow['specifications']) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value) as Record<string, string>; } catch { return {}; }
};

export const mapPublicProduct = (row: PublicProductRow): Product => {
  const name = sanitizePublicProductName(row.title);
  const description = sanitizePublicProductText(row.description);
  const images = (row.images || []).filter((item) => item.url).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)).map((item) => ({ url: item.url, altText: sanitizePublicProductText(item.alt_text) || name }));
  if (!images.length && row.image_url) images.push({ url: row.image_url, altText: name });
  return ({
  unitsSold: Number(row.units_sold || 0), recentUnits: Number(row.recent_units || 0), trendingUnits: Number(row.trending_units || 0),
  id: Number(row.id), slug: row.slug, name, brand: row.brand || '', model: sanitizePublicProductText(row.model), packSize: sanitizePublicProductText(row.pack_size),
  category: row.category, price: Number(row.selling_price), compareAt: row.original_displayed_price && Number(row.original_displayed_price) > Number(row.selling_price) ? Number(row.original_displayed_price) : undefined,
  promotionStartAt: row.promotion_start_at || undefined, promotionEndAt: row.promotion_end_at || undefined,
  image: images[0]?.url || '', images, accent: accents[Number(row.id) % accents.length], short: description.slice(0, 140), description,
  specs: sanitizePublicProductSpecs(parseSpecs(row.specifications)), status: 'published', retailer: row.retailer || 'Mzansi Mega Store', stockStatus: row.stock_status || 'unknown', fulfilmentType: row.fulfilment_type || 'unknown', fulfilmentSignal: row.fulfilment_signal || undefined, supplierCheckRequired: Boolean(row.supplier_check_required), supplierLastCheckedAt: row.last_checked_at || undefined,
  deliveryEstimate: row.delivery_estimate || { fulfilmentLabel: 'Delivery timing being confirmed', supplierMinDays: 2, supplierMaxDays: 6, processingDays: 1, courierMinDays: 3, courierMaxDays: 5, totalMinDays: 6, totalMaxDays: 12, summary: '6–12 business days' },
  });
};

export const money = (value: number) => new Intl.NumberFormat('en-ZA', {
  style: 'currency', currency: 'ZAR', maximumFractionDigits: 0,
}).format(value);
