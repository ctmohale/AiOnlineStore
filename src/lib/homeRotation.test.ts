import { describe, expect, it } from 'vitest';
import type { Product } from '../data/products';
import { HOME_ROTATION_MS, HOMEPAGE_PRICE_CEILING, homeRotationBucket, homepageProductPool, rotatingProducts } from './homeRotation';

describe('homepage product rotation', () => {
  it('uses stable ten-minute time windows', () => {
    expect(homeRotationBucket(HOME_ROTATION_MS - 1)).toBe(0);
    expect(homeRotationBucket(HOME_ROTATION_MS)).toBe(1);
    expect(homeRotationBucket(HOME_ROTATION_MS * 2 - 1)).toBe(1);
  });

  it('changes the selection without repeating within a window', () => {
    const products = Array.from({ length: 30 }, (_, index) => index + 1);
    const first = rotatingProducts(products, 6, 10);
    const next = rotatingProducts(products, 6, 11);
    expect(new Set(first).size).toBe(6);
    expect(next).not.toEqual(first);
  });

  it('keeps high-priced outliers and incomplete galleries off the homepage', () => {
    const product = (id: number, price: number, imageCount: number, compareAt?: number) => ({
      id, price, compareAt, images: Array.from({ length: imageCount }, (_, index) => ({ url: `https://example.test/${id}-${index}.jpg`, altText: 'Product' })),
    } as Product);
    const pool = homepageProductPool([
      product(1, 999, 3, 1299),
      product(2, HOMEPAGE_PRICE_CEILING + 1, 3, 25000),
      product(3, 499, 1, 699),
    ], 1);
    expect(pool.map((item) => item.id)).toEqual([1]);
  });

  it('supports separate non-overlapping hero and grid windows', () => {
    const products = Array.from({ length: 30 }, (_, index) => index + 1);
    const hero = rotatingProducts(products, 5, 20);
    const grid = rotatingProducts(products, 6, 20, 5);
    expect(grid.some((product) => hero.includes(product))).toBe(false);
  });
});
