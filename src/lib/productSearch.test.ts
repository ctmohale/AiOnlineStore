import { describe, expect, it } from 'vitest';
import { mapPublicProduct } from '../data/products';
import { matchesProductSearch } from './productSearch';
const product=mapPublicProduct({ id:51,slug:'huggies',title:'Huggies Extra Care Nappies Size 2 Tape Diapers',brand:'Huggies',model:'Extra Care Nappies Size 2',pack_size:'1 pack',category:'Baby Care',description:'',specifications:{},selling_price:918.85,image_url:null });
describe('product search normalization', () => {
  it('finds copied names with quotes, punctuation, extra spaces and mixed case', () => {
    expect(matchesProductSearch(product,'“HUGGIES, Extra-Care Nappies  Size 2 Tape Diapers”')).toBe(true);
    expect(matchesProductSearch(product,'huggies\u00a0extra care')).toBe(true);
  });
  it('searches pack sizes and requires all query terms', () => {
    expect(matchesProductSearch(product,'Huggies 1 pack')).toBe(true);
    expect(matchesProductSearch(product,'Huggies kettle')).toBe(false);
  });
});
