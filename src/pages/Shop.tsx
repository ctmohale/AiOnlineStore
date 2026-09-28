import { Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { products } from '../data/products';

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const [sort, setSort] = useState('featured');
  const query = params.get('q') || '';
  const category = params.get('category') || 'All';
  const categories = ['All', ...new Set(products.map((product) => product.category))];
  const visible = useMemo(() => {
    const filtered = products.filter((product) => (category === 'All' || product.category === category) && `${product.name} ${product.brand} ${product.model}`.toLowerCase().includes(query.toLowerCase()));
    return [...filtered].sort((a, b) => sort === 'low' ? a.price - b.price : sort === 'high' ? b.price - a.price : a.id - b.id);
  }, [category, query, sort]);
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); if (value && value !== 'All') next.set(key, value); else next.delete(key); setParams(next); };
  return <section className="section shop-page">
    <div className="shop-title"><p className="kicker">Current collection</p><h1>Useful things, <em>fairly priced.</em></h1><p>Every listing is reviewed before it goes live. We check again before asking you to pay.</p></div>
    <div className="shop-toolbar">
      <label className="shop-search"><Search size={18} /><input value={query} onChange={(event) => update('q', event.target.value)} placeholder="Search the collection" /></label>
      <div className="filter-pills"><SlidersHorizontal size={18} />{categories.map((item) => <button className={category === item ? 'active' : ''} onClick={() => update('category', item)} key={item}>{item}</button>)}</div>
      <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort products"><option value="featured">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select>
    </div>
    <p className="results-count">{visible.length} {visible.length === 1 ? 'product' : 'products'}</p>
    {visible.length ? <div className="product-grid">{visible.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="empty-state"><h2>No exact matches yet</h2><p>Try another search or browse all products.</p><button className="button primary" onClick={() => setParams({})}>Clear filters</button></div>}
  </section>;
}
