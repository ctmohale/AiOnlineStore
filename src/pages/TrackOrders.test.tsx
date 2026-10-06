import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { customerRequest } from '../lib/api';
import TrackOrders from './TrackOrders';

vi.mock('../lib/api', () => ({ customerRequest: vi.fn() }));
vi.mock('../lib/storage', () => ({ clearCustomerToken: vi.fn(), getCustomerToken: () => 'customer-token' }));

beforeEach(() => {
  window.scrollTo = vi.fn();
  vi.mocked(customerRequest).mockResolvedValue([{
    reference: 'MMS-2026-ABC123', status: 'awaiting_payment', item_summary: 'Hisense TV × 1', product_revenue: 4999,
    customer_delivery_charged: 0, created_at: '2026-10-06T08:00:00Z', payment_link: 'https://pay.example.test/order', payment_provider: 'yoco',
  }]);
});

it('shows signed-in orders on their own tracking page', async () => {
  render(<MemoryRouter initialEntries={['/orders']}><Routes><Route path="/orders" element={<TrackOrders />} /></Routes></MemoryRouter>);
  expect(await screen.findByText('MMS-2026-ABC123')).toBeInTheDocument();
  expect(screen.getByText('Awaiting payment')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Pay securely with Yoco/ })).toHaveAttribute('href', 'https://pay.example.test/order');
  expect(screen.queryByText('Change password')).not.toBeInTheDocument();
});
