import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProductVisual from './ProductVisual';
import type { Product } from '../data/products';

const product: Product = {
  id: 1, slug: 'clipper', name: 'Wahl Hair Clipper', brand: 'Wahl', model: 'Classic',
  packSize: '', category: 'Personal Care Appliances', price: 1299, image: '',
  accent: '#f3e9df', short: '', description: '', specs: {}, status: 'published',
};

describe('ProductVisual', () => {
  it('shows a product type illustration when no photo is provided', () => {
    const { container } = render(<ProductVisual product={product} />);
    expect(screen.getByText('Product illustration')).toBeInTheDocument();
    expect(container.querySelector('svg.product-illustration')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('falls back to the illustration when a photo fails to load', () => {
    render(<ProductVisual product={{ ...product, image: 'https://example.com/missing.jpg' }} />);
    const image = screen.getByRole('img', { name: product.name });
    expect(screen.getByText('Product photo')).toBeInTheDocument();
    fireEvent.error(image);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Product illustration')).toBeInTheDocument();
  });
});
