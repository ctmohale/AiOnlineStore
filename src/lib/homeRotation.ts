import type { Product } from '../data/products';

export const HOME_ROTATION_MS = 10 * 60 * 1000;

export const homeRotationBucket = (now = Date.now()) => Math.floor(now / HOME_ROTATION_MS);

export const rotatingProducts = <T>(items: T[], count: number, bucket: number, offset = 0) => {
  if (!items.length || count <= 0) return [];
  const result: T[] = [];
  const start = ((bucket * 11 + offset) % items.length + items.length) % items.length;
  for (let index = 0; index < Math.min(count, items.length); index += 1) result.push(items[(start + index) % items.length]);
  return result;
};

export const homepageProductPool = (products: Product[], required: number) => {
  const promotions = products.filter((product) => product.compareAt && product.compareAt > product.price);
  return promotions.length >= required ? promotions : products;
};
