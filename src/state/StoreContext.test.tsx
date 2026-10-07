import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import type { Product } from '../data/products';
import { customerRequest } from '../lib/api';
import { CUSTOMER_TOKEN_KEY } from '../lib/storage';
import { StoreProvider, useStore } from './StoreContext';

const products = [1, 2].map((id) => ({
  id, slug: `product-${id}`, name: `Product ${id}`, brand: 'Brand', model: '', packSize: '1 unit', category: 'Test', price: id * 100,
  image: `${id}.jpg`, images: [], accent: '#fff', short: '', description: '', specs: {}, status: 'published', stockStatus: 'in_stock',
} as Product));

vi.mock('../lib/api', () => ({ customerRequest: vi.fn() }));
vi.mock('./CatalogContext', () => ({ useCatalog: () => ({ products, loading: false, error: '' }) }));

function CartProbe() {
  const { cart, count } = useStore();
  return <div><span data-testid="count">{count}</span>{cart.map((line) => <span key={line.product.id}>{line.product.name}:{line.quantity}</span>)}</div>;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(CUSTOMER_TOKEN_KEY, 'customer-token');
  localStorage.setItem('mzansi-mega-store-cart', JSON.stringify([{ product: products[0], quantity: 1 }]));
  vi.mocked(customerRequest).mockReset();
  vi.mocked(customerRequest).mockImplementation(async (path, options) => {
    if (path === '/cart' && (!options || options.silent)) return { customerId: 7, items: [{ productId: 1, quantity: 3 }, { productId: 2, quantity: 2 }] };
    return null;
  });
});

test('hydrates and merges the account cart without duplicating products', async () => {
  render(<StoreProvider><CartProbe /></StoreProvider>);
  expect(await screen.findByText('Product 1:3')).toBeInTheDocument();
  expect(screen.getByText('Product 2:2')).toBeInTheDocument();
  expect(screen.getByTestId('count')).toHaveTextContent('5');
  await waitFor(() => expect(customerRequest).toHaveBeenCalledWith('/cart', expect.objectContaining({
    method: 'PUT',
    body: JSON.stringify({ items: [{ productId: 1, quantity: 3 }, { productId: 2, quantity: 2 }] }),
  })));
});

test('treats the database as authoritative for an already-owned cart cache', async () => {
  localStorage.setItem('mzansi-mega-store-cart-owner', '7');
  localStorage.setItem('mzansi-mega-store-cart', JSON.stringify([{ product: products[0], quantity: 10 }]));
  vi.mocked(customerRequest).mockImplementation(async (path, options) => {
    if (path === '/cart' && (!options || options.silent)) return { customerId: 7, items: [{ productId: 2, quantity: 2 }] };
    return null;
  });
  render(<StoreProvider><CartProbe /></StoreProvider>);
  expect(await screen.findByText('Product 2:2')).toBeInTheDocument();
  expect(screen.queryByText('Product 1:10')).not.toBeInTheDocument();
  expect(screen.getByTestId('count')).toHaveTextContent('2');
});
