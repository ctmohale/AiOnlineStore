import { describe, expect, it } from 'vitest';
import { mapPublicProduct, type Product } from '../data/products';
import { matchesProductSearch, rankProductSearch } from './productSearch';

const product = (id: number, name: string, brand: string, category: string, model = '') => ({
  id, name, brand, category, model, packSize: '', price: 999, slug: `product-${id}`,
} as Product);

describe('advanced product search', () => {
  const products = [
    product(1, 'Samsung Galaxy S26 Ultra', 'Samsung', 'Smartphones'),
    product(2, 'Hisense 65 inch Mini LED Smart TV', 'Hisense', 'Televisions'),
    product(3, 'Goldair Digital Air Fryer', 'Goldair', 'Cooking Appliances'),
    product(4, 'JBL Portable Bluetooth Speaker', 'JBL', 'Audio'),
  ];

  it('matches product names, brands and categories', () => {
    expect(rankProductSearch(products, 'Samsung')[0].id).toBe(1);
    expect(rankProductSearch(products, 'Televisions')[0].id).toBe(2);
  });

  it('understands common shopping terms and small spelling mistakes', () => {
    expect(rankProductSearch(products, 'tv')[0].id).toBe(2);
    expect(rankProductSearch(products, 'samsang')[0].id).toBe(1);
    expect(rankProductSearch(products, 'bluetooth speaker')[0].id).toBe(4);
  });

  it('does not treat short words inside a product name as a longer search term', () => {
    const babyProducts = [
      product(5, 'Little One Stroller Luxe 2-in-1', 'Little One', 'Baby Travel'),
      product(6, 'Beko Side by Side Fridge', 'Beko', 'Kitchen Large Appliances'),
      product(7, 'Samsung B-Series Soundbar', 'Samsung', 'Audio'),
    ];

    expect(rankProductSearch(babyProducts, 'baby').map((item) => item.id)).toEqual([5]);
  });

  it('does not return similarly spelled but unrelated product types', () => {
    const catalogue = [
      product(8, 'Wonderwagon Baby Stroller', 'Wonderwagon', 'Baby Travel'),
      product(9, 'Solid Oak Kitchen Trolley', 'Home Living', 'Kitchen Storage'),
      product(10, '600W Spark Machine', 'Generic', 'Electronic Security'),
      product(11, 'Defy Front Loader Washing Machine', 'Defy', 'Washers-Dryers'),
    ];

    expect(rankProductSearch(catalogue, 'stroller', 20).map((item) => item.id)).toEqual([8]);
    expect(rankProductSearch(catalogue, 'washing machine', 20).map((item) => item.id)).toEqual([11]);
  });

  it('uses typo matching only when there is no direct partial match', () => {
    const catalogue = [
      product(12, 'Apple iPhone 8', 'Apple', 'Handsets'),
      product(13, 'Defy Kitchen Appliance Set', 'Defy', 'Kitchen Appliances'),
    ];

    expect(rankProductSearch(catalogue, 'appli', 20).map((item) => item.id)).toEqual([13]);
    expect(rankProductSearch(products, 'samsang')[0].id).toBe(1);
  });

  it('keeps tables separate from tablets and laptop categories', () => {
    const catalogue = [
      product(14, 'Solid Oak Dining Table', 'Home Living', 'Dining Furniture'),
      product(15, 'Competition Pool Table', 'Easi8', 'Sports'),
      product(16, 'Chuwi CoreBook Laptop', 'Chuwi', 'Laptops Tablets Computers'),
      product(17, 'Samsung Galaxy Tablet', 'Samsung', 'Laptops Tablets Computers'),
    ];

    expect(rankProductSearch(catalogue, 'table', 20).map((item) => item.id)).toEqual([14, 15]);
    expect(rankProductSearch(catalogue, 'tablet', 20).map((item) => item.id)).toEqual([17]);
  });

  it('treats phone and phones as the same product intent without accessories', () => {
    const catalogue = [
      product(18, 'Honor 400 Lite 8GB 5G', 'Honor', 'Mobile-Devices'),
      product(19, 'Blackview Rugged Phone Fort 100', 'Blackview', 'Handsets'),
      product(20, 'Apple AirPods 4', 'Apple', 'Headphones'),
      product(21, 'Honor Watch and Earbuds', 'Honor', 'Mobile-Devices'),
      product(22, 'Xiaomi Redmi Pad 2 Tablet', 'Xiaomi', 'Handsets'),
      { ...product(23, 'Outdoor Security Camera', 'Guard', 'Electronic Security'), packSize: 'Compatible with Mobile' },
    ];

    expect(new Set(rankProductSearch(catalogue, 'phone', 20).map((item) => item.id))).toEqual(new Set([18, 19]));
    expect(new Set(rankProductSearch(catalogue, 'phones', 20).map((item) => item.id))).toEqual(new Set([18, 19]));
    expect(new Set(rankProductSearch(catalogue, 'smartphones', 20).map((item) => item.id))).toEqual(new Set([18, 19]));
  });

  it('keeps common product-type searches inside the intended product family', () => {
    const catalogue = [
      product(24, 'Lenovo IdeaPad Laptop 16GB 512GB SSD', 'Lenovo', 'Laptops'),
      product(25, 'Kindle Scribe Notebook With Pen', 'Amazon', 'Tablets'),
      product(26, 'Hisense 65 inch Smart TV', 'Hisense', 'Televisions'),
      product(27, 'Retro Arcade Console for TV', 'Generic', 'Gaming Hardware'),
      product(28, 'Defy Front Loader Washing Machine', 'Defy', 'Washers-Dryers'),
      product(29, 'Karcher High Pressure Washer', 'Karcher', 'Hardware'),
      product(30, 'Bosch 300L Fridge Freezer', 'Bosch', 'Fridges'),
      product(31, 'Three Seat Lounge Sofa', 'Home Living', 'Living Room'),
      product(32, 'Huggies Dry Comfort Nappies', 'Huggies', 'Baby Care'),
      product(33, 'Epson Printer 4000lm Portable Projector', 'Epson', 'Projectors'),
      product(34, 'Epson EcoTank Colour Printer', 'Epson', 'Printers'),
      product(35, 'Mecer 3kVA Pure Sine Wave Inverter', 'Mecer', 'Inverters'),
      product(36, 'Samsung Digital Inverter Washing Machine', 'Samsung', 'Washers-Dryers'),
      product(37, 'Sony PS5 Slim Digital Console', 'Sony', 'Gaming Hardware'),
      product(38, 'Racing Steering Wheel for PC and PS5', 'Generic', 'Gaming Hardware'),
      product(39, 'Retro Handheld Gaming Console', 'Generic', 'Gaming Hardware'),
      product(40, '120cm Console Table', 'Furniture & Designs', 'Gaming Hardware'),
      product(41, 'Lenovo Laptop Bundle With Mouse and Headphone', 'Lenovo', 'Laptops'),
    ];

    expect(new Set(rankProductSearch(catalogue, 'laptops', 20).map((item) => item.id))).toEqual(new Set([24, 41]));
    expect(rankProductSearch(catalogue, 'tv', 20).map((item) => item.id)).toEqual([26]);
    expect(rankProductSearch(catalogue, 'washing machine', 20).map((item) => item.id)).toEqual([28, 36]);
    expect(new Set(rankProductSearch(catalogue, 'washer', 20).map((item) => item.id))).toEqual(new Set([28, 29, 36]));
    expect(rankProductSearch(catalogue, 'refrigerator', 20).map((item) => item.id)).toEqual([30]);
    expect(rankProductSearch(catalogue, 'couch', 20).map((item) => item.id)).toEqual([31]);
    expect(rankProductSearch(catalogue, 'diapers', 20).map((item) => item.id)).toEqual([32]);
    expect(rankProductSearch(catalogue, 'printer', 20).map((item) => item.id)).toEqual([34]);
    expect(rankProductSearch(catalogue, 'inverter', 20).map((item) => item.id)).toEqual([35]);
    expect(new Set(rankProductSearch(catalogue, 'console', 20).map((item) => item.id))).toEqual(new Set([27, 37, 39]));
    expect(rankProductSearch(catalogue, 'ps5', 20).map((item) => item.id)).toEqual([37]);
    expect(rankProductSearch(catalogue, 'Lenovo Laptop Bundle With Mouse and Headphone', 20).map((item) => item.id)).toEqual([41]);
  });

  it('requires every typed word and respects the result limit', () => {
    expect(rankProductSearch(products, 'Goldair fryer').map((item) => item.id)).toEqual([3]);
    expect(rankProductSearch(products, 'Samsung fryer')).toEqual([]);
    expect(rankProductSearch(products, 'a', 2)).toHaveLength(2);
  });

  it('keeps copied-name, punctuation and pack-size matching used by the shop', () => {
    const huggies = mapPublicProduct({ id:51, slug:'huggies', title:'Huggies Extra Care Nappies Size 2 Tape Diapers', brand:'Huggies', model:'Extra Care Nappies Size 2', pack_size:'1 pack', category:'Baby Care', description:'', specifications:{}, selling_price:918.85, image_url:null });
    expect(matchesProductSearch(huggies, '“HUGGIES, Extra-Care Nappies  Size 2 Tape Diapers”')).toBe(true);
    expect(matchesProductSearch(huggies, 'huggies\u00a0extra care')).toBe(true);
    expect(matchesProductSearch(huggies, 'Huggies 1 pack')).toBe(true);
    expect(matchesProductSearch(huggies, 'Huggies kettle')).toBe(false);
  });
});
