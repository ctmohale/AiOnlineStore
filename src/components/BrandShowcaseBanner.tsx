import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Product } from '../data/products';

const priorityBrands = ['Samsung', 'Hisense', 'Defy', 'LG', 'Huawei', 'HP', 'Bosch', 'Philips'];

const brandKey = (value: string) => value.trim().toLocaleLowerCase('en-ZA');

const brandLogos: Record<string, string> = {
  samsung: 'https://upload.wikimedia.org/wikipedia/commons/b/b4/Samsung_wordmark.svg',
  hisense: 'https://upload.wikimedia.org/wikipedia/commons/4/47/Hisense.svg',
  defy: 'https://upload.wikimedia.org/wikipedia/commons/7/7d/Defy-logo.jpg',
  lg: 'https://upload.wikimedia.org/wikipedia/commons/9/92/LG_Electronics_Logo_%28modern%29.svg',
  huawei: 'https://upload.wikimedia.org/wikipedia/commons/d/db/Huawei_wordmark_2019.svg',
  hp: 'https://upload.wikimedia.org/wikipedia/commons/a/ad/HP_logo_2012.svg',
  bosch: 'https://upload.wikimedia.org/wikipedia/commons/1/16/Bosch-logo.svg',
  philips: 'https://upload.wikimedia.org/wikipedia/commons/5/52/Philips_logo_new.svg',
};

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
    <img className="brand-showcase-art" src="/brand-showcase-banner-v2.jpg" alt="Premium home appliances and technology overlooking Cape Town at sunset" loading={compact ? 'lazy' : 'eager'} decoding="async" />
    <div className="brand-showcase-content">
      <span className="brand-showcase-kicker">Leading brands</span>
      <h2 id={titleId}>Big brands.<br /><em>Mzansi choice.</em></h2>
      <Link className="brand-showcase-action" to="/shop">Shop brands <ArrowRight /></Link>
    </div>
    <div className="brand-showcase-rail">
      <span>Featured brands</span>
      <nav aria-label="Featured product brands">
        {brands.map((brand) => {
          const key = brandKey(brand);
          const logo = brandLogos[key];
          return <Link className="brand-wordmark" key={brand} to={`/shop?q=${encodeURIComponent(brand)}`} aria-label={`Shop ${brand} products`}>
            {logo ? <img src={logo} alt={`${brand} logo`} loading="lazy" decoding="async" /> : <span>{brand}</span>}
          </Link>;
        })}
      </nav>
    </div>
  </section>;
}
