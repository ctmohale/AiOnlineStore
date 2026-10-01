import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestPayment from './TestPayment';

const request = vi.fn();
const payment = vi.fn();
vi.mock('../lib/api', () => ({ customerRequest: (...args: unknown[]) => request(...args), testPayment: (...args: unknown[]) => payment(...args) }));

const order = { reference: 'MMS-2026-TEST', is_test: 1, status: 'requested', item_summary: 'Philips whisk × 1', product_revenue: 779, customer_delivery_charged: 89, created_at: '2026-09-28T12:00:00Z' };
const page = () => render(<MemoryRouter initialEntries={['/test-payment/MMS-2026-TEST']}><Routes><Route path="/test-payment/:reference" element={<TestPayment />} /></Routes></MemoryRouter>);

describe('test payment page', () => {
  beforeEach(() => { request.mockReset(); payment.mockReset(); request.mockResolvedValue([order]); });

  it('keeps a failed simulation unpaid and permits a successful retry', async () => {
    payment.mockResolvedValueOnce({ status: 'test_failed', charged: false }).mockResolvedValueOnce({ status: 'test_paid', charged: false });
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Simulate failed payment' }));
    expect(await screen.findByText(/Test payment failed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Simulate successful payment' }));
    await waitFor(() => expect(screen.getByText(/Test payment successful/)).toBeInTheDocument());
    expect(payment).toHaveBeenNthCalledWith(1, order.reference, 'failure');
    expect(payment).toHaveBeenNthCalledWith(2, order.reference, 'success');
  });

  it('does not offer payment for a missing or unrelated test order', async () => {
    request.mockResolvedValueOnce([]);
    page();
    expect(await screen.findByText(/does not belong to your account/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Simulate successful payment' })).not.toBeInTheDocument();
  });
});
