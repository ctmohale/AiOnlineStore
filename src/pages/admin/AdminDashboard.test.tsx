import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { FeedbackProvider } from '../../components/FeedbackProvider';
import { adminRequest } from '../../lib/api';
import { ADMIN_TOKEN_KEY } from '../../lib/storage';
import AdminDashboard from './AdminDashboard';

vi.mock('../../lib/api', () => ({ adminRequest: vi.fn() }));

const order = {
  id: 4,
  reference: 'MMS-1004',
  customer_name: 'Test Customer',
  customer_email: 'test@example.com',
  customer_phone: '0600000000',
  address_line_1: '1 Test Street',
  suburb: 'Test Suburb',
  city: 'Johannesburg',
  province: 'Gauteng',
  postal_code: '2000',
  item_summary: '1 × Test Kettle',
  product_revenue: 499,
  customer_delivery_charged: 0,
  supplier_product_cost: 299,
  status: 'requested',
  is_test: false,
  created_at: '2026-10-01T08:00:00Z',
};

beforeEach(() => {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, 'test-token');
  vi.mocked(adminRequest).mockReset();
  vi.mocked(adminRequest).mockImplementation(async (path) => {
    if (path === '/orders') return [order];
    if (path === '/review-queue' || path === '/products') return [];
    if (path === '/pricing-settings') return { minimum_profit: 100, minimum_margin_percent: 5, standard_markup_percent: 7, supplier_stale_hours: 24, free_delivery_threshold: 1000, standard_customer_delivery: 99 };
    if (path === '/me') return { id: 1, email: 'admin@example.com', name: 'Admin User', role: 'admin' };
    if (path === '/analytics') return { summary: {}, projection: { basis: '', basis_days: 1, projected_monthly_revenue: 0, projected_monthly_profit: 0 }, daily: [], statuses: [], generatedAt: '2026-10-01T08:00:00Z' };
    if (path === '/emails') return { summary: { pending: 0, processing: 0, sent: 2, failed: 0 }, messages: [] };
    if (path === '/orders/4/operations') return { items: [], history: [], payments: [], cases: [] };
    throw new Error(`Unexpected request: ${path}`);
  });
});

test('opens order operations in a modal from the full-width order list', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><FeedbackProvider><AdminDashboard /></FeedbackProvider></MemoryRouter>);

  await waitFor(() => expect(adminRequest).toHaveBeenCalledWith('/orders'));
  await user.click(screen.getByRole('button', { name: /^Orders/ }));
  await user.click(await screen.findByRole('button', { name: 'Order details' }));

  expect(screen.getByRole('dialog', { name: 'MMS-1004' })).toBeInTheDocument();
  expect(screen.getByText('Order pricing')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Close order operations' }));
  expect(screen.queryByRole('dialog', { name: 'MMS-1004' })).not.toBeInTheDocument();
});

test('shows and hides each administrator password field independently', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><FeedbackProvider><AdminDashboard /></FeedbackProvider></MemoryRouter>);

  await waitFor(() => expect(adminRequest).toHaveBeenCalledWith('/pricing-settings'));
  await user.click(screen.getByRole('button', { name: 'Pricing settings' }));

  const currentPassword = screen.getByLabelText('Current password');
  const newPassword = screen.getByLabelText('New password');
  expect(currentPassword).toHaveAttribute('type', 'password');
  expect(newPassword).toHaveAttribute('type', 'password');

  await user.click(screen.getByRole('button', { name: 'Show current password' }));
  expect(currentPassword).toHaveAttribute('type', 'text');
  expect(newPassword).toHaveAttribute('type', 'password');

  await user.click(screen.getByRole('button', { name: 'Show new password' }));
  expect(newPassword).toHaveAttribute('type', 'text');
});
