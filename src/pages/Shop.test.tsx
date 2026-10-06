import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { mapPublicProduct, type Product } from '../data/products';
import Shop from './Shop';
import Layout from '../components/Layout';

const products = [
  mapPublicProduct({ id:51, slug:'huggies-extra-care-nappies-size-2-tape-diapers-extra-care-nappies-size-2-909b2a', title:'Huggies Extra Care Nappies Size 2 Tape Diapers', brand:'Huggies', model:'Extra Care Nappies Size 2', pack_size:'1 pack', category:'Baby Care', description:'Nappies', specifications:{}, selling_price:918.85, image_url:null }),
  mapPublicProduct({ id:52, slug:'huggies-dry-comfort', title:'Huggies Dry Comfort Jumbo Pack Size 1 Tape Diapers', brand:'Huggies', model:'Dry Comfort', pack_size:'1 pack', category:'Baby Care', description:'Nappies', specifications:{}, selling_price:435.85, image_url:null }),
];
vi.mock('../state/CatalogContext', () => ({ useCatalog: () => ({ products, settings:null, loading:false, error:'', refresh:vi.fn() }) }));
vi.mock('../state/StoreContext', () => ({ useStore: () => ({ count:0 }) }));
vi.mock('../components/ProductCard', () => ({ default: ({product}:{product:Product}) => <a href={`/product/${product.slug}`}>{product.name}</a> }));
const extraCare='Huggies Extra Care Nappies Size 2 Tape Diapers';
function Location() { const location=useLocation(); return <output data-testid="location">{location.search}</output>; }
function mount(entry:string, header=false) {
  return render(<MemoryRouter initialEntries={[entry]}><Routes>{header ? <Route element={<Layout />}><Route path="/shop" element={<><Shop /><Location /></>} /></Route> : <Route path="/shop" element={<><Shop /><Location /></>} />}</Routes></MemoryRouter>);
}

describe('shop product search', () => {
  it('finds the reported Huggies product by its exact title', () => {
    mount('/shop?q='+encodeURIComponent(extraCare));
    expect(screen.getByRole('link',{name:extraCare})).toHaveAttribute('href','/product/'+products[0].slug);
    expect(screen.queryByText('No exact matches yet')).not.toBeInTheDocument();
  });
  it('recovers a department-hidden match without losing the search text', async () => {
    const user=userEvent.setup();
    mount('/shop?category=Electronics&q='+encodeURIComponent(extraCare));
    expect(screen.queryByRole('link',{name:extraCare})).not.toBeInTheDocument();
    expect(screen.getByText('1 matching product is hidden by your department or price filters.')).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Search all products'}));
    expect(screen.getByRole('link',{name:extraCare})).toBeInTheDocument();
    expect(screen.getByRole('textbox',{name:'Search products'})).toHaveValue(extraCare);
    expect(screen.getByTestId('location').textContent).not.toContain('category=');
  });
  it('reveals the R919 match hidden by Under R500 even when another result is visible', async () => {
    const user=userEvent.setup();
    mount('/shop?q=Huggies');
    await user.click(screen.getByRole('button',{name:'Under R500'}));
    expect(screen.queryByRole('link',{name:extraCare})).not.toBeInTheDocument();
    expect(screen.getByRole('link',{name:products[1].name})).toBeInTheDocument();
    expect(screen.getByText('1 matching product is hidden by your department or price filters.')).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Search all products'}));
    expect(screen.getByRole('link',{name:extraCare})).toBeInTheDocument();
  });
  it('submits the header search through its visible button and clears the old department', async () => {
    const user=userEvent.setup();
    mount('/shop?category=Electronics',true);
    await user.type(screen.getAllByRole('textbox',{name:'Search products'})[0],'  Huggies Extra Care  ');
    await user.click(screen.getByRole('button',{name:'Submit product search'}));
    await waitFor(() => expect(screen.getByRole('link',{name:extraCare})).toBeInTheDocument());
    expect(screen.getByTestId('location')).toHaveTextContent('?q=Huggies%20Extra%20Care');
  });
  it('opens and closes the compact mobile filter panel', async () => {
    const user=userEvent.setup();
    mount('/shop');
    const toggle=screen.getByRole('button',{name:'Filter products'});
    const panel=screen.getByRole('complementary',{name:'Product filters'});
    expect(toggle).toHaveAttribute('aria-expanded','false');
    expect(panel).not.toHaveClass('open');
    await user.click(toggle);
    expect(screen.getByRole('button',{name:'Close filters'})).toHaveAttribute('aria-expanded','true');
    expect(panel).toHaveClass('open');
    await user.click(screen.getByRole('button',{name:'Close filters'}));
    expect(screen.getByRole('button',{name:'Filter products'})).toHaveAttribute('aria-expanded','false');
    expect(panel).not.toHaveClass('open');
  });
});
