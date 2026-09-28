import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '../FeedbackProvider';
import { adminRequest } from '../../lib/api';
import ProductManager from './ProductManager';

vi.mock('../../lib/api', () => ({ adminRequest: vi.fn() }));

const product = {
  id: 91,
  title: 'Test Kettle',
  brand: 'Acme',
  model: 'KT-100',
  barcode: null,
  pack_size: '1 unit',
  category: 'Appliances',
  description: 'Test product',
  specifications: {},
  selling_price: 499,
  minimum_profit: 120,
  estimated_customer_delivery_cost: 0,
  delivery_time: null,
  item_weight_size: null,
  internal_review_notes: null,
  status: 'draft',
  image_url: null,
  retailer: 'Game',
  current_cost: 299,
  supplier_delivery_cost: 0,
};

describe('ProductManager actions', () => {
  beforeEach(() => {
    vi.mocked(adminRequest).mockReset();
    vi.mocked(adminRequest).mockImplementation(async (path, options) => {
      if (path === '/products' && !options) return [product];
      if (path === `/products/${product.id}` && options?.method === 'DELETE') return null;
      throw new Error(`Unexpected request: ${path}`);
    });
  });

  it('uses the custom confirmation dialog and deletes only after confirmation', async () => {
    const user = userEvent.setup();
    render(<FeedbackProvider><ProductManager /></FeedbackProvider>);

    expect(await screen.findByText('Test Kettle')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete Test Kettle' }));
    let dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Delete this product?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(adminRequest).not.toHaveBeenCalledWith(`/products/${product.id}`, expect.anything());

    await user.click(screen.getByRole('button', { name: 'Delete Test Kettle' }));
    dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete product' }));

    await waitFor(() => expect(adminRequest).toHaveBeenCalledWith(`/products/${product.id}`, { method: 'DELETE' }));
    expect(screen.queryByText('Test Kettle')).not.toBeInTheDocument();
    expect(await screen.findByText('Product deleted')).toBeInTheDocument();
  });
});
