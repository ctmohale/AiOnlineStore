import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { customerRequest } from '../lib/api';
import Layout from './Layout';

vi.mock('../state/StoreContext', () => ({ useStore: () => ({ count: 0 }) }));
vi.mock('../state/CatalogContext', () => ({ useCatalog: () => ({ products: [], settings: null }) }));
vi.mock('../lib/api', () => ({ customerRequest: vi.fn() }));
vi.mock('../lib/storage', () => ({
  clearCustomerToken: vi.fn(),
  CUSTOMER_AUTH_EVENT: 'mzansi-customer-auth-changed',
  CUSTOMER_TOKEN_KEY: 'mzansi-mega-store-customer-token',
  getCustomerToken: () => 'customer-token',
}));

beforeEach(() => {
  vi.mocked(customerRequest).mockResolvedValue({ id: 4, name: 'Nomsa Dlamini', email: 'nomsa@example.com', phone: '0821234567' });
});

test('shows the signed-in customer in the main navigation', async () => {
  render(<MemoryRouter><Routes><Route element={<Layout />}><Route index element={<div>Home</div>} /></Route></Routes></MemoryRouter>);
  const account = await screen.findByRole('link', { name: 'Signed in as Nomsa Dlamini' });
  expect(account).toHaveTextContent('Signed in');
  expect(account).toHaveTextContent('Nomsa');
  expect(account).toHaveAttribute('href', '/account');
});
