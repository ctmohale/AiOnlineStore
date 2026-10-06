import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { FeedbackProvider } from '../components/FeedbackProvider';
import { customerRequest } from '../lib/api';
import Checkout from './Checkout';

const mocks = vi.hoisted(() => ({ token: null as string | null }));

vi.mock('../state/StoreContext', () => ({
  useStore: () => ({
    cart: [{ product: { id: 7, name: 'Test product', brand: 'Mzansi', packSize: 'Large', price: 499, accent: '#fff', retailer: 'Test retailer', fulfilmentType: 'local_stock', stockStatus: 'in_stock' }, quantity: 3 }],
    subtotal: 1497,
    clear: vi.fn(),
  }),
}));

vi.mock('../state/CatalogContext', () => ({
  useCatalog: () => ({ settings: { freeDeliveryThreshold: 500, standardCustomerDelivery: 89 } }),
}));

vi.mock('../lib/storage', () => ({
  clearCustomerToken: vi.fn(),
  getCustomerToken: () => mocks.token,
}));

vi.mock('../lib/api', () => ({ customerRequest: vi.fn(), createOrder: vi.fn() }));

beforeEach(() => { localStorage.clear(); mocks.token = null; vi.mocked(customerRequest).mockResolvedValue({ id: 1, name: 'Nomsa Dlamini', email: 'nomsa@example.com', phone: '0821234567' }); });

test('requires a customer account before showing the payment form', async () => {
  render(<MemoryRouter><FeedbackProvider><Checkout /></FeedbackProvider></MemoryRouter>);
  expect(await screen.findByText('Account required')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Sign in/ })).toHaveAttribute('href', '/account?returnTo=%2Frequest&mode=login');
  expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/account?returnTo=%2Frequest&mode=register');
  expect(screen.queryByRole('button', { name: /Continue to secure payment/ })).not.toBeInTheDocument();
});

test('centres the product quantity in a badge attached to the product image', async () => {
  mocks.token = 'customer-token';
  render(<MemoryRouter><FeedbackProvider><Checkout /></FeedbackProvider></MemoryRouter>);
  const quantity = await screen.findByLabelText('Quantity 3');
  expect(quantity).toHaveTextContent('3');
  expect(quantity.parentElement).toHaveClass('checkout-item-visual');
  expect(screen.getByText('3 items in your order')).toBeInTheDocument();
});
