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

export const homepageProductPool = (products: Product[], required: number) => products
  .filter((product) => product.price > 0 && product.price <= HOMEPAGE_PRICE_CEILING
    && (product.images?.length || 0) >= 3 && (product.unitsSold || 0) > 0)
  .sort((left, right) => (right.trendingUnits || 0) - (left.trendingUnits || 0)
    || (right.recentUnits || 0) - (left.recentUnits || 0)
    || (right.unitsSold || 0) - (left.unitsSold || 0) || left.id - right.id)
  .slice(0, Math.max(required, 20));
