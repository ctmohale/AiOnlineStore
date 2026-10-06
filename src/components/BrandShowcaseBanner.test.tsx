import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { mapPublicProduct } from '../data/products';
import BrandShowcaseBanner from './BrandShowcaseBanner';

const products = [
  mapPublicProduct({ id: 1, slug: 'hisense-tv', title: 'Hisense TV', brand: 'HISENSE', model: '', pack_size: '1 unit', category: 'Television', description: '', specifications: {}, selling_price: 4999, image_url: null }),
  mapPublicProduct({ id: 2, slug: 'defy-fridge', title: 'Defy Fridge', brand: 'Defy', model: '', pack_size: '1 unit', category: 'Home Appliances', description: '', specifications: {}, selling_price: 6999, image_url: null }),
];

describe('brand showcase banner', () => {
  it('keeps the requested leading brands and links them to shop search', () => {
    render(<MemoryRouter><BrandShowcaseBanner products={products} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Shop Samsung products' })).toHaveAttribute('href', '/shop?q=Samsung');
    expect(screen.getByRole('link', { name: 'Shop HISENSE products' })).toHaveAttribute('href', '/shop?q=HISENSE');
    expect(screen.getByRole('link', { name: 'Shop Defy products' })).toHaveAttribute('href', '/shop?q=Defy');
    expect(screen.getByRole('img')).toHaveAttribute('src', '/brand-showcase-banner-v1.webp');
    expect(screen.getByRole('link', { name: /Shop brands/ })).toHaveAttribute('href', '/shop');
    expect(screen.queryByText(/Explore well-known names/)).not.toBeInTheDocument();
  });
});
