import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { FeedbackProvider } from '../components/FeedbackProvider';
import { createOrder, customerRequest } from '../lib/api';
import Checkout from './Checkout';

const mocks = vi.hoisted(() => ({ token: null as string | null, clear: vi.fn() }));

vi.mock('../state/StoreContext', () => ({
  useStore: () => ({
    cart: [{ product: { id: 7, name: 'Test product', brand: 'Mzansi', packSize: 'Large', price: 499, accent: '#fff', retailer: 'Test retailer', fulfilmentType: 'local_stock', stockStatus: 'in_stock' }, quantity: 3 }],
    subtotal: 1497,
    clear: mocks.clear,
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

beforeEach(() => {
  localStorage.clear(); mocks.token = null; mocks.clear.mockReset();
  vi.mocked(customerRequest).mockResolvedValue({ id: 1, name: 'Nomsa Dlamini', email: 'nomsa@example.com', phone: '0821234567' });
  vi.mocked(createOrder).mockReset();
});

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

test('does not clear the cart while checkout or payment remains incomplete', async () => {
  mocks.token = 'customer-token';
  vi.mocked(createOrder).mockResolvedValue({ reference: 'MMS-2026-KEEP01', status: 'requested', paymentLink: null, paymentError: 'Payment could not be opened.' });
  const { container } = render(<MemoryRouter><FeedbackProvider><Checkout /></FeedbackProvider></MemoryRouter>);
  expect(await screen.findByText('Delivery details,')).toBeInTheDocument();

  const set = (name: string, value: string) => {
    const input = container.querySelector<HTMLInputElement>(`[name="${name}"]`);
    if (!input) throw new Error(`Missing ${name}`);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  set('addressLine1', '10 Main Road'); set('suburb', 'Rosebank'); set('city', 'Johannesburg'); set('postalCode', '2196');
  const province = container.querySelector<HTMLSelectElement>('[name="province"]')!;
  province.value = 'Gauteng'; province.dispatchEvent(new Event('change', { bubbles: true }));
  const terms = container.querySelector<HTMLInputElement>('.terms-consent input')!;
  terms.click();
  screen.getByRole('button', { name: /Continue to secure payment/ }).click();
  (await screen.findByRole('button', { name: 'Continue to Yoco' })).click();

  await vi.waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1));
  expect(mocks.clear).not.toHaveBeenCalled();
});
