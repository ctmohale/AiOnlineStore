import { Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { useCatalog } from '../state/CatalogContext';

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const { products, loading, error, refresh } = useCatalog();
  const [sort, setSort] = useState('featured');
  const [page, setPage] = useState(1);
  const query = params.get('q') || '';
  const category = params.get('category') || 'All';
  const categories = ['All', ...new Set(products.map((product) => product.category))];
  const visible = useMemo(() => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const filtered = products.filter((product) => (category === 'All' || product.category === category) && words.every((word) => `${product.name} ${product.brand} ${product.model} ${product.category}`.toLowerCase().includes(word)));
    return [...filtered].sort((a, b) => sort === 'low' ? a.price - b.price : sort === 'high' ? b.price - a.price : a.id - b.id);
  }, [category, products, query, sort]);
  const pageSize = 48;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageProducts = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); if (value && value !== 'All') next.set(key, value); else next.delete(key); setPage(1); setParams(next); };
  return <section className="section shop-page">
    <div className="shop-title"><p className="kicker">Current collection</p><h1>Useful things, <em>fairly priced.</em></h1><p>Every listing is reviewed before it goes live. We check again before asking you to pay.</p></div>
    <div className="shop-toolbar">
      <label className="shop-search"><Search size={18} /><input value={query} onChange={(event) => update('q', event.target.value)} placeholder="Search the collection" /></label>
      <div className="filter-pills"><SlidersHorizontal size={18} />{categories.map((item) => <button className={category === item ? 'active' : ''} onClick={() => update('category', item)} key={item}>{item}</button>)}</div>
      <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} aria-label="Sort products"><option value="featured">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select>
    </div>
    <p className="results-count">{visible.length} {visible.length === 1 ? 'product' : 'products'}</p>
    {loading ? <p className="catalogue-state">Loading the live catalogue…</p> : error ? <div className="empty-state"><h2>Catalogue unavailable</h2><p>{error}</p><button type="button" className="button primary" onClick={() => void refresh()}>Try again</button></div> : visible.length ? <><div className="product-grid">{pageProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div>{pageCount > 1 && <nav className="catalogue-pagination" aria-label="Catalogue pages"><button type="button" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Previous</button><span>Page {currentPage} of {pageCount}</span><button type="button" disabled={currentPage === pageCount} onClick={() => { setPage(currentPage + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Next</button></nav>}</> : <div className="empty-state"><h2>{products.length ? 'No exact matches yet' : 'No products published yet'}</h2><p>{products.length ? 'Try another search or browse all products.' : 'Verified products added in Admin will appear here.'}</p>{products.length > 0 && <button type="button" className="button primary" onClick={() => { setPage(1); setParams({}); }}>Clear filters</button>}</div>}
  </section>;
}
