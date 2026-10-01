import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminRequest } from '../../lib/api';
import { FeedbackProvider } from '../FeedbackProvider';
import CustomerManager from './CustomerManager';

vi.mock('../../lib/api', () => ({ adminRequest: vi.fn() }));

const customer = { id: 7, name: 'Example Customer', email: 'customer@example.com', phone: '082 123 4567', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', order_count: 2, last_order_at: null };

describe('CustomerManager', () => {
  beforeEach(() => {
    vi.mocked(adminRequest).mockReset();
    vi.mocked(adminRequest).mockImplementation(async (path, options) => {
      if (path === '/customers' && !options) return [customer];
      if (path === '/customers/7' && options?.method === 'PATCH') return { id: 7, name: customer.name, email: customer.email, phone: customer.phone };
      throw new Error(`Unexpected request: ${path}`);
    });
  });

  it('confirms and saves customer profile and password updates', async () => {
    const user = userEvent.setup();
    render(<FeedbackProvider><CustomerManager /></FeedbackProvider>);
    expect(await screen.findByText('Example Customer')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit Example Customer' }));
    await user.type(screen.getByLabelText(/New temporary password/), 'temporary-password');
    await user.click(screen.getByRole('button', { name: 'Save customer' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Update profile and password?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save customer' }));

    await waitFor(() => expect(adminRequest).toHaveBeenCalledWith('/customers/7', expect.objectContaining({ method: 'PATCH' })));
    expect(await screen.findByText('Customer updated')).toBeInTheDocument();
  });
});
