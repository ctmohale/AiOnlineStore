import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import OrderWorkflow from './OrderWorkflow';

const mocks = vi.hoisted(() => ({ request: vi.fn(), confirm: vi.fn(), notify: vi.fn() }));
vi.mock('../../lib/api', () => ({ adminRequest: mocks.request }));
vi.mock('../FeedbackProvider', () => ({ useFeedback: () => ({ confirm: mocks.confirm, notify: mocks.notify }) }));

const order = { id: 4, ref: 'MMS-TEST', status: 'requested', customer: 'Test Customer', email: 'test@example.test', phone: '0600000000', address: '1 Test Street', isTest: false };

afterEach(() => vi.clearAllMocks());

test('moves a real order into supplier checking and refreshes it', async () => {
  mocks.confirm.mockResolvedValue(true); mocks.request.mockResolvedValue({ status: 'checking_supplier' });
  const changed = vi.fn().mockResolvedValue(undefined);
  render(<OrderWorkflow order={order} onChanged={changed} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start supplier check' }));
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/orders/4/status', { method: 'PATCH', body: JSON.stringify({ status: 'checking_supplier' }) }));
  expect(changed).toHaveBeenCalledOnce();
});

test('never offers fulfilment actions for test orders', () => {
  render(<OrderWorkflow order={{ ...order, isTest: true }} onChanged={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Start supplier check' })).not.toBeInTheDocument();
  expect(screen.getByText(/No purchase, shipment or real payment/)).toBeInTheDocument();
});
