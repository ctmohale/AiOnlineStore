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
  image_url: 'https://example.com/kettle.jpg',
  retailer: 'Game',
  current_cost: 299,
  supplier_delivery_cost: 0,
};

const secondProduct = {
  ...product,
  id: 92,
  title: 'Example Phone',
  category: 'Electronics',
  status: 'published',
  stock_status: 'in_stock',
  retailer: 'Makro',
  image_url: 'https://example.com/phone.jpg',
};

describe('ProductManager actions', () => {
  beforeEach(() => {
    vi.mocked(adminRequest).mockReset();
    vi.mocked(adminRequest).mockImplementation(async (path, options) => {
      if (path === '/products' && !options) return [product, secondProduct];
      if (path === `/products/${product.id}` && options?.method === 'DELETE') return null;
      throw new Error(`Unexpected request: ${path}`);
    });
  });

  it('finds the reported Huggies product beyond the first 5000 catalogue records', async () => {
    const firstPage = Array.from({ length: 5000 }, (_, index) => ({ ...product, id: index + 1000 }));
    const huggies = { ...product, id: 51, title: 'Huggies Extra Care Nappies Size 2 Tape Diapers', selling_price: 918.85, category: 'Baby nappies', status: 'published' };
    vi.mocked(adminRequest).mockImplementation(async (path) => {
      if (path === '/products') return firstPage;
      if (path === '/products?offset=5000') return [huggies];
      throw new Error(`Unexpected request: ${path}`);
    });
    render(<FeedbackProvider><ProductManager searchQuery="Huggies Extra Care Nappies Size 2" /></FeedbackProvider>);
    expect(await screen.findByText(huggies.title)).toBeInTheDocument();
    expect(screen.getByText('1 of 5001 products shown')).toBeInTheDocument();
    expect(adminRequest).toHaveBeenCalledWith('/products?offset=5000');
  });

  it('stops safely when an older API ignores the requested offset', async () => {
    const firstPage = Array.from({ length: 5000 }, (_, index) => ({ ...product, id: index + 1000 }));
    vi.mocked(adminRequest).mockImplementation(async (path) => {
      if (path.startsWith('/products')) return firstPage;
      throw new Error(`Unexpected request: ${path}`);
    });
    render(<FeedbackProvider><ProductManager searchQuery="Huggies" /></FeedbackProvider>);
    expect(await screen.findByText('The catalogue API needs to finish updating before all products can be loaded. Refresh shortly.')).toBeInTheDocument();
    expect(vi.mocked(adminRequest).mock.calls.filter(([path]) => path.startsWith('/products'))).toHaveLength(2);
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

  it('shows product images and filters the catalogue as the search changes', async () => {
    const { rerender } = render(<FeedbackProvider><ProductManager searchQuery="kettle" /></FeedbackProvider>);

    expect(await screen.findByRole('img', { name: 'Test Kettle thumbnail' })).toHaveAttribute('src', 'https://example.com/kettle.jpg');
    expect(screen.getByText('1 of 2 products shown')).toBeInTheDocument();

    rerender(<FeedbackProvider><ProductManager searchQuery="iphone" /></FeedbackProvider>);
    expect(screen.queryByText('Test Kettle')).not.toBeInTheDocument();
    expect(screen.getByText('No products match the current search and filters.')).toBeInTheDocument();
  });

  it('combines table filters and clears them immediately', async () => {
    const user = userEvent.setup();
    render(<FeedbackProvider><ProductManager /></FeedbackProvider>);
    expect(await screen.findByText('Test Kettle')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Publication status'), 'published');
    expect(screen.queryByText('Test Kettle')).not.toBeInTheDocument();
    expect(screen.getByText('Example Phone')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 products shown')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Product source'), 'Game');
    expect(screen.getByText('No products match the current search and filters.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('Test Kettle')).toBeInTheDocument();
    expect(screen.getByText('Example Phone')).toBeInTheDocument();
  });
});
