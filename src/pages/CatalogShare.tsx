import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import ShareActions from '../components/ShareActions';
import { useCatalog } from '../state/CatalogContext';
import { setPageSeo } from '../lib/seo';

export default function CatalogShare() {
  const { products, loading } = useCatalog(); const [params] = useSearchParams();
  const ids = useMemo(() => new Set((params.get('ids') || '').split(',').map(Number).filter(Boolean).slice(0, 24)), [params]);
  const title = (params.get('title') || 'Selected deals from Moya Market').slice(0, 90);
  const selected = ids.size ? products.filter((product) => ids.has(product.id)) : products.slice(0, 12);
  useEffect(() => { const canonical = window.location.href; setPageSeo({ title: `${title} | Moya Market`, description: `${selected.length} selected products with stock and price checked before payment.`, canonical, image: selected[0]?.image, type: 'website', jsonLd: { '@context': 'https://schema.org', '@type': 'ItemList', name: title, numberOfItems: selected.length, itemListElement: selected.map((product, index) => ({ '@type': 'ListItem', position: index + 1, url: `${window.location.origin}/product/${product.slug}`, name: product.name })) } }); }, [selected, title]);
  if (loading) return <div className="empty-state"><p>Loading shared catalogue…</p></div>;
  return <section className="section shared-catalog"><p className="kicker">Shared catalogue</p><h1>{title}</h1><p>Selected by Moya Market. We confirm supplier stock and price before asking you to pay.</p><ShareActions url={window.location.href} title={title} text={`View ${title} from Moya Market.`} />{selected.length ? <div className="product-grid">{selected.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="empty-state"><h2>These products are no longer available</h2><Link className="button primary" to="/shop">Browse current products</Link></div>}</section>;
}
