import type { Product } from '../data/products';

const normalize = (value: string) => (value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).join(' ');

export const matchesProductSearch = (product: Product, query: string) => {
  const terms = normalize(query).split(' ').filter(Boolean);
  const text = normalize([product.name, product.brand, product.model, product.packSize, product.category].join(' '));
  return terms.every((term) => text.includes(term));
};
