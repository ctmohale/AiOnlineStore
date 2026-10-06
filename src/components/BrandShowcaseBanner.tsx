import { ArrowRight, BadgeCheck, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Product } from '../data/products';

const priorityBrands = ['Samsung', 'Hisense', 'Defy', 'LG', 'Huawei', 'HP', 'Bosch', 'Philips'];

const brandKey = (value: string) => value.trim().toLocaleLowerCase('en-ZA');

function featuredBrandNames(products: Product[], limit = 8) {
  const catalogueBrands = new Map<string, { name: string; count: number }>();
  products.forEach((product) => {
    if (!product.brand?.trim()) return;
    const key = brandKey(product.brand);
    const current = catalogueBrands.get(key);
    catalogueBrands.set(key, { name: current?.name || product.brand.trim(), count: (current?.count || 0) + 1 });
  });

  const selected = priorityBrands.map((name) => catalogueBrands.get(brandKey(name))?.name || name);
  const selectedKeys = new Set(selected.map(brandKey));
  const remaining = [...catalogueBrands.values()]
    .filter(({ name }) => !selectedKeys.has(brandKey(name)))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map(({ name }) => name);

  return [...selected, ...remaining].slice(0, limit);
}

type Props = {
  products: Product[];
  compact?: boolean;
};

export default function BrandShowcaseBanner({ products, compact = false }: Props) {
  const brands = featuredBrandNames(products);
  const titleId = compact ? 'shop-brand-showcase-title' : 'home-brand-showcase-title';

  return <section className={`brand-showcase${compact ? ' compact' : ''}`} aria-labelledby={titleId}>
    <img className="brand-showcase-art" src="/brand-showcase-banner-v1.webp" alt="Television, appliances, laptop, phone, blender and outdoor gazebo" loading={compact ? 'lazy' : 'eager'} decoding="async" />
    <div className="brand-showcase-content">
      <span className="brand-showcase-kicker">Leading names · One Mzansi store</span>
      <h2 id={titleId}>Big brands.<br /><em>Mzansi choice.</em></h2>
      <p>Explore well-known names across technology, appliances, home and everyday essentials—all in one growing catalogue.</p>
      <div className="brand-showcase-promises">
        <span><BadgeCheck /> Clear ZAR pricing</span>
        <span><Truck /> Nationwide delivery</span>
      </div>
      <Link className="brand-showcase-action" to="/shop">Shop leading brands <ArrowRight /></Link>
    </div>
    <div className="brand-showcase-rail">
      <span>Featured brands</span>
      <nav aria-label="Featured product brands">
        {brands.map((brand) => <Link className={`brand-wordmark brand-${brandKey(brand).replace(/[^a-z0-9]+/g, '-')}`} key={brand} to={`/shop?q=${encodeURIComponent(brand)}`} aria-label={`Shop ${brand} products`}>{brand}</Link>)}
      </nav>
    </div>
  </section>;
}
