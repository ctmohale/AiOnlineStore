import type { Product } from '../data/products';

export const HOME_ROTATION_MS = 10 * 60 * 1000;
export const HOMEPAGE_PRICE_CEILING = 15_000;

export const homeRotationBucket = (now = Date.now()) => Math.floor(now / HOME_ROTATION_MS);

export const rotatingProducts = <T>(items: T[], count: number, bucket: number, offset = 0) => {
  if (!items.length || count <= 0) return [];
  const result: T[] = [];
  const start = ((bucket + offset) % items.length + items.length) % items.length;
  for (let index = 0; index < Math.min(count, items.length); index += 1) result.push(items[(start + index) % items.length]);
  return result;
};

export const homepageProductSections = <T extends { id: number }>(items: T[], bucket: number, count = 4) => {
  const deals = rotatingProducts(items, count, bucket, 5);
  const dealIds = new Set(deals.map((product) => product.id));
  const popular = items.filter((product) => !dealIds.has(product.id)).slice(0, count);
  return { deals, popular };
};

export const homepageProductPool = (products: Product[], required: number, fillWithAvailable = false) => {
  const available = products.filter((product) => product.price > 0
    && product.price <= HOMEPAGE_PRICE_CEILING && Boolean(product.image || product.images?.some((image) => image.url))
    && !['out_of_stock', 'unavailable'].includes(product.stockStatus || ''));
  const sellers = available.filter((product) => (product.unitsSold || 0) > 0)
    .sort((left, right) => (right.trendingUnits || 0) - (left.trendingUnits || 0)
      || (right.recentUnits || 0) - (left.recentUnits || 0)
      || (right.unitsSold || 0) - (left.unitsSold || 0) || left.id - right.id);
  const rankedAvailable = [...available].sort((left, right) => Number((right.images?.length || 0) >= 3)
    - Number((left.images?.length || 0) >= 3) || left.id - right.id)
  if (!sellers.length) return rankedAvailable.slice(0, Math.max(required, 20));
  if (!fillWithAvailable) return sellers.slice(0, Math.max(required, 20));
  const sellerIds = new Set(sellers.map((product) => product.id));
  return [...sellers, ...rankedAvailable.filter((product) => !sellerIds.has(product.id))]
    .slice(0, Math.max(required, 20));
};
