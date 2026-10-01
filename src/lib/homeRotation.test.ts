import { describe, expect, it } from 'vitest';
import { HOME_ROTATION_MS, homeRotationBucket, rotatingProducts } from './homeRotation';

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

  it('supports separate non-overlapping hero and grid windows', () => {
    const products = Array.from({ length: 30 }, (_, index) => index + 1);
    const hero = rotatingProducts(products, 5, 20);
    const grid = rotatingProducts(products, 6, 20, 5);
    expect(grid.some((product) => hero.includes(product))).toBe(false);
  });
});
