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
  it('selects only filtered unpublished products and clears selection when filters change', async () => {
    const user = userEvent.setup();
    render(<FeedbackProvider><ProductManager /></FeedbackProvider>);
    await screen.findByText('Test Kettle');
    await user.click(screen.getByRole('checkbox', { name: 'Select all filtered products' }));
    expect(screen.getByRole('checkbox', { name: 'Select Test Kettle' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Example Phone' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publish selected (1)' })).toBeEnabled();
    await user.selectOptions(screen.getByLabelText('Product source'), 'Makro');
    expect(screen.getByRole('button', { name: 'Publish selected (0)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publish filtered (0)' })).toBeDisabled();
  });

  it('requires every review confirmation and publishes only selected products', async () => {
    const user = userEvent.setup();
    let published = false;
    vi.mocked(adminRequest).mockImplementation(async (path, options) => {
      if (path === '/products' && !options) return [{ ...product, status: published ? 'published' : 'draft' }, secondProduct];
      if (path === '/products/91/review') { published = true; return { status: 'published' }; }
      throw new Error(`Unexpected request: ${path}`);
    });
    render(<FeedbackProvider><ProductManager /></FeedbackProvider>);
    await screen.findByText('Test Kettle');
    await user.click(screen.getByRole('checkbox', { name: 'Select Test Kettle' }));
    await user.click(screen.getByRole('button', { name: 'Publish selected (1)' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Publish 1 products' })).toBeDisabled();
    expect(adminRequest).not.toHaveBeenCalledWith('/products/91/review', expect.anything());
    for (const checkbox of within(dialog).getAllByRole('checkbox')) await user.click(checkbox);
    await user.click(within(dialog).getByRole('button', { name: 'Publish 1 products' }));
    await waitFor(() => expect(adminRequest).toHaveBeenCalledWith('/products/91/review', expect.objectContaining({ method: 'PATCH' })));
    const [, options] = vi.mocked(adminRequest).mock.calls.find(([path]) => path === '/products/91/review')!;
    expect(JSON.parse(String(options?.body)).checklist).toEqual({ exactProductMatch:true, supplierPriceChecked:true, stockChecked:true, promotionDatesChecked:true, imagesChecked:true, descriptionChecked:true });
    expect(adminRequest).not.toHaveBeenCalledWith('/products/92/review', expect.anything());
    expect(await screen.findByText('1 published; 0 could not be published.')).toBeInTheDocument();
  });

  it('publishes filtered results with partial failures and shows the blocked product reason', async () => {
    const user = userEvent.setup();
    const third = { ...product, id:93, title:'Third Kettle', status:'pending_review' };
    vi.mocked(adminRequest).mockImplementation(async (path, options) => {
      if (path === '/products' && !options) return [product, secondProduct, third];
      if (path === '/products/91/review') return { status:'published' };
      if (path === '/products/93/review') throw new Error('The supplier check is stale; recheck it before publishing');
      throw new Error(`Unexpected request: ${path}`);
    });
    render(<FeedbackProvider><ProductManager /></FeedbackProvider>);
    await screen.findByText('Test Kettle');
    await user.selectOptions(screen.getByLabelText('Product source'), 'Game');
    await user.click(screen.getByRole('button', { name: 'Publish filtered (2)' }));
    const dialog=screen.getByRole('dialog');
    for (const checkbox of within(dialog).getAllByRole('checkbox')) await user.click(checkbox);
    await user.click(within(dialog).getByRole('button', { name:'Publish 2 products' }));
    expect(await screen.findByText('1 published; 1 could not be published.')).toBeInTheDocument();
    expect(screen.getByText('The supplier check is stale; recheck it before publishing')).toBeInTheDocument();
    expect(adminRequest).not.toHaveBeenCalledWith('/products/92/review', expect.anything());
  });

  it('loads every catalogue page before filtering and selecting', async () => {
    const user=userEvent.setup();
    vi.mocked(adminRequest).mockImplementation(async (path) => {
      if (path === '/products') return Array.from({length:5000}, () => product);
      if (path === '/products?offset=5000') return [{ ...secondProduct, status:'pending_review' }];
      throw new Error(`Unexpected request: ${path}`);
    });
    render(<FeedbackProvider><ProductManager /></FeedbackProvider>);
    await screen.findByText('Example Phone');
    expect(adminRequest).toHaveBeenCalledWith('/products?offset=5000');
    await user.selectOptions(screen.getByLabelText('Product source'),'Makro');
    expect(screen.getByRole('button',{name:'Publish filtered (1)'})).toBeEnabled();
  });

});
