import { describe, expect, it } from 'vitest';
import type { Product } from '../data/products';
import { HOME_ROTATION_MS, HOMEPAGE_PRICE_CEILING, homeRotationBucket, homepageProductPool, homepageProductSections, priorityHomepageProducts, rotatingProducts } from './homeRotation';

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

  it('keeps high-priced outliers off the homepage', () => {
    const product = (id: number, price: number, imageCount: number, compareAt?: number) => ({
      id, price, compareAt, unitsSold: 1, images: Array.from({ length: imageCount }, (_, index) => ({ url: `https://example.test/${id}-${index}.jpg`, altText: 'Product' })),
    } as Product);
    const pool = homepageProductPool([
      product(1, 999, 3, 1299),
      product(2, HOMEPAGE_PRICE_CEILING + 1, 3, 25000),
      product(3, 499, 1, 699),
    ], 1);
    expect(pool.map((item) => item.id)).toEqual([1, 3]);
  });

  it('can fill product sections without adding unsold products to the hero pool', () => {
    const make = (id: number, unitsSold: number) => ({
      id, price: 999, unitsSold, images: [{ url: `${id}.jpg`, altText: 'Product' }],
    } as Product);
    const products = [make(1, 4), make(2, 2), ...Array.from({ length: 8 }, (_, index) => make(index + 3, 0))];
    expect(homepageProductPool(products, 8).map((product) => product.id)).toEqual([1, 2]);
    expect(homepageProductPool(products, 8, true)).toHaveLength(10);
  });

  it('supports separate non-overlapping hero and grid windows', () => {
    const products = Array.from({ length: 30 }, (_, index) => index + 1);
    const hero = rotatingProducts(products, 5, 20);
    const grid = rotatingProducts(products, 6, 20, 5);
    expect(grid.some((product) => hero.includes(product))).toBe(false);
  });

  it('builds two different eight-product homepage sections', () => {
    const products = Array.from({ length: 24 }, (_, index) => ({ id: index + 1 }));
    const popularPool = products.slice(0, 10);
    const dealPool = products.slice(10);
    const { deals, popular } = homepageProductSections(popularPool, dealPool, products, 7, 8);
    expect(deals).toHaveLength(8);
    expect(popular).toHaveLength(8);
    expect(popular.some((product) => deals.some((deal) => deal.id === product.id))).toBe(false);
  });

  it('spreads homepage products across available categories before repeating one', () => {
    const products = [
      { id: 1, category: 'Televisions' }, { id: 2, category: 'Televisions' },
      { id: 3, category: 'Air Fryers' }, { id: 4, category: 'Smartphones' },
      { id: 5, category: 'Gaming' }, { id: 6, category: 'Speakers' },
    ];
    const { deals } = homepageProductSections([], products, [], 0, 4);
    expect(new Set(deals.map((product) => product.category)).size).toBe(4);
  });

  it('rotates both homepage rows in each new ten-minute window', () => {
    const products = Array.from({ length: 20 }, (_, index) => ({ id: index + 1 }));
    const first = homepageProductSections(products.slice(0, 7), products.slice(7), products, 20);
    const next = homepageProductSections(products.slice(0, 7), products.slice(7), products, 21);
    expect(next.deals.map((product) => product.id)).not.toEqual(first.deals.map((product) => product.id));
    expect(next.popular.map((product) => product.id)).not.toEqual(first.popular.map((product) => product.id));
  });

  it('cycles the requested major product groups using live demand first', () => {
    const make = (id: number, name: string, brand: string, unitsSold: number, trendingUnits = 0, compareAt = 0) => ({
      id, name, brand, category: '', model: '', packSize: '', price: 999, compareAt: compareAt || undefined,
      unitsSold, trendingUnits, images: [{ url: `${id}.jpg`, altText: name }], stockStatus: 'in_stock',
    } as Product);
    const products = [
      make(1, 'Hisense 55 inch 4K Smart TV', 'Hisense', 12, 3, 1299),
      make(2, 'Generic 55 inch Smart TV', 'Generic', 20, 0, 1299),
      make(3, 'Milex Digital Air Fryer', 'Milex', 8, 2, 1199),
      make(4, 'Samsung Galaxy Smartphone', 'Samsung', 15, 4, 1399),
      make(5, 'Sony PlayStation 5 Gaming Console', 'Sony', 10, 2, 1299),
      make(6, 'JBL Bluetooth Speaker', 'JBL', 11, 2, 1299),
    ];
    const first = priorityHomepageProducts(products, 5, 0);
    const next = priorityHomepageProducts(products, 5, 1);
    expect(first.map((product) => product.id)).toEqual([1, 3, 4, 5, 6]);
    expect(next.map((product) => product.id)).toEqual([3, 4, 5, 6, 1]);
  });

  it('keeps top-deal priority products limited to genuine savings', () => {
    const products = [
      { id: 1, name: 'Samsung Galaxy Smartphone', brand: 'Samsung', category: 'Handsets', model: '', packSize: '', price: 999, images: [{ url: '1.jpg', altText: '' }], stockStatus: 'in_stock' },
      { id: 2, name: 'Huawei nova Smartphone', brand: 'Huawei', category: 'Handsets', model: '', packSize: '', price: 999, compareAt: 1299, images: [{ url: '2.jpg', altText: '' }], stockStatus: 'in_stock' },
    ] as Product[];
    expect(priorityHomepageProducts(products, 4, 0, true).map((product) => product.id)).toEqual([2]);
  });
});

it('ranks recent demand above discount size and excludes products without sales', () => {
  const make = (id: number, unitsSold: number, trendingUnits: number, recentUnits = 0) => ({ id, price: 999, unitsSold, trendingUnits, recentUnits, images: [{url:'a'},{url:'b'},{url:'c'}] } as Product);
  expect(homepageProductPool([make(1,100,0),make(2,10,3),make(3,0,0),make(4,20,3,5)], 16).map(p => p.id)).toEqual([4,2,1]);
  expect(homepageProductPool([make(3,0,0)],16).map(p => p.id)).toEqual([3]);
});
it('advances even when the eligible pool contains eleven products', () => {
  const items = Array.from({length:11},(_,i)=>i);
  expect(rotatingProducts(items,1,1)).not.toEqual(rotatingProducts(items,1,2));
});

it('shows a single-image product before the store has any sales', () => {
  const product = { id: 1, price: 499, image: '/product.png', images: [], stockStatus: 'in_stock' } as unknown as Product;
  expect(homepageProductPool([product],16)).toEqual([product]);
  expect(homepageProductPool([{...product, stockStatus:'out_of_stock'}],16)).toEqual([]);
});
