import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { mapPublicProduct } from '../data/products';
import ProductCard from './ProductCard';
vi.mock('../state/StoreContext', () => ({ useStore: () => ({ add: vi.fn() }) }));
vi.mock('./FeedbackProvider', () => ({ useFeedback: () => ({ notify: vi.fn() }) }));
const product = mapPublicProduct({ id: 51, slug: 'huggies', title: 'Huggies Nappies', brand: 'Huggies', model: '', pack_size: '84 pieces', category: 'Baby nappies', description: '', specifications: {}, selling_price: 400, original_displayed_price: 800, image_url: null });
describe('sale product cards', () => {
  it('renders a discount sticker without a date message when the end date is missing', () => {
    render(<MemoryRouter><ProductCard product={product} /></MemoryRouter>);
    expect(screen.getByText(/Save R\s400/)).toHaveClass('product-sale-sticker');
    expect(screen.queryByText(/Sale end/)).not.toBeInTheDocument();
  });
  it('hides tiny-sale labels, dates and crossed-out prices on cards', () => {
    const { container } = render(<MemoryRouter><ProductCard product={{ ...product, price: 3449, compareAt: 3499, promotionEndAt: '2099-10-05T21:59:00Z' }} /></MemoryRouter>);
    expect(screen.queryByText(/^Save R/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sale end/)).not.toBeInTheDocument();
    expect(container.querySelector('del')).toBeNull();
  });
  it('shows neither sale sticker nor end-date message for a regular price', () => {
    render(<MemoryRouter><ProductCard product={{ ...product, compareAt: undefined }} /></MemoryRouter>);
    expect(screen.queryByText(/^Save R/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sale end/)).not.toBeInTheDocument();
  });
});
