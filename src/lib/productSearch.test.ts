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
