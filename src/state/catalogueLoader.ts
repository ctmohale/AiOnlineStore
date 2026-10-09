import type { PublicProductRow } from '../data/products';
import { publicRequest } from '../lib/api';

const PUBLIC_CATALOGUE_PAGE_SIZE = 3000;

export async function loadPublicCatalogue() {
  const loaded = new Map<number, PublicProductRow>();
  let offset = 0;
  while (true) {
    const page = await publicRequest<PublicProductRow[]>(offset ? `/products?offset=${offset}` : '/products');
    const previousSize = loaded.size;
    for (const product of page) loaded.set(Number(product.id), product);
    if (page.length < PUBLIC_CATALOGUE_PAGE_SIZE) break;
    if (loaded.size === previousSize) throw new Error('The live catalogue could not finish loading. Please refresh and try again.');
    offset += page.length;
  }
  return [...loaded.values()];
}
