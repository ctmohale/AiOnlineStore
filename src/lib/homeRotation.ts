import type { Product } from '../data/products';

export const HOME_ROTATION_MS = 10 * 60 * 1000;
export const HOMEPAGE_PRICE_CEILING = 15_000;

export const homeRotationBucket = (now = Date.now()) => Math.floor(now / HOME_ROTATION_MS);

export const rotatingProducts = <T>(items: T[], count: number, bucket: number, offset = 0) => {
  if (!items.length || count <= 0) return [];
  const result: T[] = [];
  const start = ((bucket * 11 + offset) % items.length + items.length) % items.length;
  for (let index = 0; index < Math.min(count, items.length); index += 1) result.push(items[(start + index) % items.length]);
  return result;
};

export const homepageProductPool = (products: Product[], required: number) => {
  const affordable = products
    .filter((product) => product.price > 0 && product.price <= HOMEPAGE_PRICE_CEILING && (product.images?.length || 0) >= 3)
    .sort((left, right) => {
      const leftSaving = left.compareAt && left.compareAt > left.price ? (left.compareAt - left.price) / left.compareAt : 0;
      const rightSaving = right.compareAt && right.compareAt > right.price ? (right.compareAt - right.price) / right.compareAt : 0;
      return rightSaving - leftSaving || left.price - right.price;
    });
  const promotions = affordable.filter((product) => product.compareAt && product.compareAt > product.price);
  return promotions.length >= required ? promotions : affordable;
};
