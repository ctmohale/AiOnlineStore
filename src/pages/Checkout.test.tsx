import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { FeedbackProvider } from '../components/FeedbackProvider';
import Checkout from './Checkout';

vi.mock('../state/StoreContext', () => ({
  useStore: () => ({
    cart: [{ product: { id: 7, name: 'Test product', brand: 'Mzansi', price: 499, accent: '#fff', retailer: 'Test retailer', fulfilmentType: 'local_stock', stockStatus: 'in_stock' }, quantity: 1 }],
    subtotal: 499,
    clear: vi.fn(),
  }),
}));

vi.mock('../state/CatalogContext', () => ({
  useCatalog: () => ({ settings: { freeDeliveryThreshold: 500, standardCustomerDelivery: 89 } }),
}));

vi.mock('../lib/storage', () => ({
  CUSTOMER_TOKEN_KEY: 'mzansi-mega-store-customer-token',
  getCustomerToken: () => null,
}));

beforeEach(() => localStorage.clear());

test('requires a customer account before showing the payment form', async () => {
  render(<MemoryRouter><FeedbackProvider><Checkout /></FeedbackProvider></MemoryRouter>);
  expect(await screen.findByText('Account required')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Sign in/ })).toHaveAttribute('href', '/account?returnTo=%2Frequest&mode=login');
  expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/account?returnTo=%2Frequest&mode=register');
  expect(screen.queryByRole('button', { name: /Continue to secure payment/ })).not.toBeInTheDocument();
});
