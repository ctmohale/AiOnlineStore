import type { Product } from '../data/products';

export const HOME_ROTATION_MS = 10 * 60 * 1000;
export const HOMEPAGE_PRICE_CEILING = 15_000;

const priorityGroups = [
  { key: 'large-smart-tv', matches: (text: string) => /\b(smart|qled|oled|uhd|4k)\b/.test(text) && /\b(tv|television)\b/.test(text) && /\b(55|58|60|65)(?:[\s-]*(?:inch|inches)|["”])?\b/.test(text) },
  { key: 'air-fryer', matches: (text: string) => /\bair[\s-]*fryer\b/.test(text) },
  { key: 'smartphone', matches: (text: string) => /\b(smartphone|smart phone|mobile phone|handset|iphone|galaxy|pixel|redmi|nova)\b/.test(text) && !/\b(case|cover|protector|charger|cable)\b/.test(text) },
  { key: 'gaming-console', matches: (text: string) => /\b(gaming console|playstation|ps\s?[45]|xbox|nintendo switch)\b/.test(text) && !/\b(controller|stand|case|cover|cable)\b/.test(text) },
  { key: 'bluetooth-speaker', matches: (text: string) => /\bbluetooth\b/.test(text) && /\b(speaker|soundbar|boombox)\b/.test(text) },
] as const;

const majorBrands = /\b(samsung|hisense|lg|tcl|skyworth|sony|defy|philips|bosch|milex|bennett read|huawei|apple|xiaomi|oppo|honor|nokia|motorola|playstation|xbox|nintendo|jbl|marshall|harman kardon|ultimate ears)\b/;

const productText = (product: Product) => `${product.name || ''} ${product.brand || ''} ${product.category || ''} ${product.model || ''} ${product.packSize || ''}`.toLowerCase();
const availableForHomepage = (product: Product) => product.price > 0
  && Boolean(product.image || product.images?.some((image) => image.url))
  && !['out_of_stock', 'unavailable'].includes(product.stockStatus || '');
const demandSort = (left: Product, right: Product) => (right.trendingUnits || 0) - (left.trendingUnits || 0)
  || (right.recentUnits || 0) - (left.recentUnits || 0)
  || (right.unitsSold || 0) - (left.unitsSold || 0)
  || Number(majorBrands.test(productText(right))) - Number(majorBrands.test(productText(left)))
  || Number(Boolean(right.compareAt && right.compareAt > right.price)) - Number(Boolean(left.compareAt && left.compareAt > left.price))
  || left.id - right.id;

export const homeRotationBucket = (now = Date.now()) => Math.floor(now / HOME_ROTATION_MS);

export const rotatingProducts = <T>(items: T[], count: number, bucket: number, offset = 0) => {
  if (!items.length || count <= 0) return [];
  const result: T[] = [];
  const start = ((bucket + offset) % items.length + items.length) % items.length;
  for (let index = 0; index < Math.min(count, items.length); index += 1) result.push(items[(start + index) % items.length]);
  return result;
};

export const priorityHomepageProducts = (products: Product[], count: number, bucket: number, dealsOnly = false) => {
  if (count <= 0) return [];
  const eligible = products.filter((product) => availableForHomepage(product)
    && (!dealsOnly || Boolean(product.compareAt && product.compareAt > product.price)));
  const orderedGroups = rotatingProducts([...priorityGroups], priorityGroups.length, bucket);
  const cycle = Math.floor(bucket / priorityGroups.length);
  const selected: Product[] = [];
  const used = new Set<number>();
  for (const group of orderedGroups) {
    const candidates = eligible.filter((product) => group.matches(productText(product))).sort(demandSort);
    if (!candidates.length) continue;
    const shortlist = candidates.slice(0, Math.min(3, candidates.length));
    const product = shortlist[cycle % shortlist.length];
    selected.push(product);
    used.add(product.id);
    if (selected.length === count) return selected;
  }
  const remaining = eligible.filter((product) => priorityGroups.some((group) => group.matches(productText(product))) && !used.has(product.id)).sort(demandSort);
  return [...selected, ...remaining].slice(0, count);
};

export const homepageProductSections = <T extends { id: number }>(popularItems: T[], dealItems: T[], fallbackItems: T[], bucket: number, count = 4) => {
  const deals = rotatingProducts(dealItems, count, bucket, 5);
  const dealIds = new Set(deals.map((product) => product.id));
  const popular: T[] = [];
  const popularIds = new Set<number>();
  const candidates = [
    ...rotatingProducts(popularItems, popularItems.length, bucket),
    ...rotatingProducts(fallbackItems, fallbackItems.length, bucket, 9),
  ];
  for (const product of candidates) {
    if (dealIds.has(product.id) || popularIds.has(product.id)) continue;
    popular.push(product);
    popularIds.add(product.id);
    if (popular.length === count) break;
  }
  return { deals, popular };
};

export const homepageProductPool = (products: Product[], required: number, fillWithAvailable = false) => {
  const available = products.filter((product) => availableForHomepage(product) && product.price <= HOMEPAGE_PRICE_CEILING);
  const sellers = available.filter((product) => (product.unitsSold || 0) > 0)
    .sort(demandSort);
  const rankedAvailable = [...available].sort((left, right) => Number((right.images?.length || 0) >= 3)
    - Number((left.images?.length || 0) >= 3) || left.id - right.id);
  if (!sellers.length) return rankedAvailable.slice(0, Math.max(required, 20));
  if (!fillWithAvailable) return sellers.slice(0, Math.max(required, 20));
  const sellerIds = new Set(sellers.map((product) => product.id));
  return [...sellers, ...rankedAvailable.filter((product) => !sellerIds.has(product.id))]
    .slice(0, Math.max(required, 20));
};
