import { ArrowRight, Check, ChevronRight, Home, PackageCheck, Search, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { useCatalog } from '../state/CatalogContext';
import { categorySummaries, matchesCategory, FOCUSED_CATEGORIES } from '../lib/categories';
import { matchesProductSearch } from '../lib/productSearch';

const departmentImages: Record<string, string> = {
  ...Object.fromEntries(FOCUSED_CATEGORIES.map(({ name, image }) => [name, image])),
  'Electronics & Computing': '/category-electronics.png',
  'Home Appliances': '/category-appliances.png',
  'Home & Furniture': '/category-home-furniture.png',
  'Tools & Automotive': '/category-tools-automotive.png',
  'Outdoor & Sports': '/category-outdoor-sports.png',
  'Health, Beauty & Baby': '/category-health-beauty-baby.png',
  'Food & Household': '/category-food-household.png',
  'Office & Stationery': '/category-office-stationery.png',
};

const priceOptions = [
  { value: 'all', label: 'All prices' },
  { value: 'under-500', label: 'Under R500' },
  { value: '500-2000', label: 'R500 – R2 000' },
  { value: 'over-2000', label: 'R2 000 and above' },
];

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const { products, loading, error, refresh } = useCatalog();
  const [categoryQuery, setCategoryQuery] = useState('');
  const [sort, setSort] = useState('featured');
  const [priceRange, setPriceRange] = useState('all');
  const query = params.get('q') || '';
  const category = params.get('category') || 'All';
  const requestedPage = Math.max(1, Number(params.get('page')) || 1);
  const categoryData = categorySummaries(products);
  const displayedCategories = categoryData.filter((item) => `${item.name} ${FOCUSED_CATEGORIES.find((focused) => focused.name === item.name)?.description || ''}`.toLowerCase().includes(categoryQuery.trim().toLowerCase()));
  const searchMatches = useMemo(() => products.filter((product) => matchesProductSearch(product, query)), [products, query]);
  const visible = useMemo(() => {
    const filtered = searchMatches.filter((product) => {
      const matchesPrice = priceRange === 'under-500' ? product.price < 500
        : priceRange === '500-2000' ? product.price >= 500 && product.price < 2000
          : priceRange === 'over-2000' ? product.price >= 2000
            : true;
      return matchesPrice && matchesCategory(product.category, category, `${product.name} ${product.brand} ${product.model}`);
    });
    return [...filtered].sort((a, b) => sort === 'low' ? a.price - b.price : sort === 'high' ? b.price - a.price : a.id - b.id);
  }, [category, priceRange, searchMatches, sort]);
  const hiddenMatches = query.trim() ? searchMatches.length - visible.length : 0;
  const pageSize = 24;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(requestedPage, pageCount);
  const pageProducts = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const paginationItems = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pageCount])].filter((item) => item >= 1 && item <= pageCount).sort((a, b) => a - b);
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); if (value && value !== 'All') next.set(key, value); else next.delete(key); next.delete('page'); setParams(next); };
  const clearFilters = () => { setPriceRange('all'); setParams({}); };
  const searchAllProducts = () => { setPriceRange('all'); const next = new URLSearchParams(params); next.delete('category'); next.delete('page'); setParams(next); };
  const goToPage = (nextPage: number) => {
    const next = new URLSearchParams(params);
    if (nextPage > 1) next.set('page', String(nextPage)); else next.delete('page');
    setParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return <main className="retail-shop">
    <section className="shop-page-hero">
      <nav aria-label="Breadcrumb"><Link to="/"><Home /> Home</Link><ChevronRight /><span>Shop</span></nav>
      <div className="shop-page-hero-copy"><span>Mzansi Mega Store catalogue</span><h1>Shop all products.</h1><p>Everyday essentials, appliances, technology and more—with clear ZAR pricing and nationwide delivery.</p></div>
    </section>

    <section className="shop-department-strip" aria-label="Product categories">
      <label className="shop-category-search"><Search aria-hidden="true" /><input value={categoryQuery} onChange={(event) => setCategoryQuery(event.target.value)} placeholder="Find a category…" aria-label="Find a product category" />{categoryQuery && <button type="button" onClick={() => setCategoryQuery('')} aria-label="Clear category search"><X /></button>}</label>
      {!displayedCategories.length && <p className="shop-category-empty" role="status">No categories match. Try another name or search products below.</p>}
      <div className="shop-department-links" tabIndex={0} role="group" aria-label="Product categories; scroll horizontally for more">{displayedCategories.map((item) => <button type="button" className={category === item.name ? 'active' : ''} title={FOCUSED_CATEGORIES.find((focused) => focused.name === item.name)?.description || item.name} aria-pressed={category === item.name} onClick={() => update('category', item.name)} key={item.name}>
        <span>{departmentImages[item.name] ? <img src={departmentImages[item.name]} alt="" loading="lazy" /> : <PackageCheck />}</span><strong>{item.name}</strong><small>{item.count.toLocaleString('en-ZA')} products</small>
      </button>)}</div>
    </section>

    <div className="shop-catalogue-layout">
      <aside className="shop-filter-panel" aria-label="Product filters">
        <div className="shop-filter-title"><div><SlidersHorizontal /><strong>Filters</strong></div>{(category !== 'All' || priceRange !== 'all' || query) && <button type="button" onClick={clearFilters}>Clear all</button>}</div>
        <div className="shop-filter-group"><h2>Department</h2><button type="button" aria-pressed={category === 'All'} className={category === 'All' ? 'active' : ''} onClick={() => update('category', 'All')}><span aria-hidden="true">{category === 'All' && <Check />}</span><b>All products</b><small>{products.length.toLocaleString('en-ZA')}</small></button>{categoryData.map((item) => <button type="button" aria-pressed={category === item.name} className={category === item.name ? 'active' : ''} onClick={() => update('category', item.name)} key={item.name}><span aria-hidden="true">{category === item.name && <Check />}</span><b>{item.name}</b><small>{item.count.toLocaleString('en-ZA')}</small></button>)}</div>
        <div className="shop-filter-group"><h2>Price</h2>{priceOptions.map((option) => <button type="button" aria-pressed={priceRange === option.value} className={priceRange === option.value ? 'active' : ''} onClick={() => { setPriceRange(option.value); update('page', ''); }} key={option.value}><span aria-hidden="true">{priceRange === option.value && <Check />}</span><b>{option.label}</b></button>)}</div>
      </aside>

      <section className="shop-results" aria-labelledby="shop-results-heading">
        <div className="shop-results-toolbar">
          <label className="shop-search"><Search /><input value={query} onChange={(event) => update('q', event.target.value)} placeholder="Search products, brands and categories" aria-label="Search products" />{query && <button type="button" onClick={() => update('q', '')} aria-label="Clear search"><X /></button>}</label>
          <label className="sort-filter"><span>Sort by</span><select value={sort} onChange={(event) => { setSort(event.target.value); update('page', ''); }} aria-label="Sort products"><option value="featured">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></label>
        </div>
        <div className="shop-results-summary"><div><h2 id="shop-results-heading">{category === 'All' ? 'All products' : category}</h2><p aria-live="polite">{visible.length.toLocaleString('en-ZA')} {visible.length === 1 ? 'product' : 'products'}{pageCount > 1 ? ` · Page ${currentPage} of ${pageCount}` : ''}</p></div>{(category !== 'All' || priceRange !== 'all' || query) && <div className="shop-active-filters">{category !== 'All' && <button type="button" onClick={() => update('category', 'All')}>{category}<X /></button>}{priceRange !== 'all' && <button type="button" onClick={() => setPriceRange('all')}>{priceOptions.find((option) => option.value === priceRange)?.label}<X /></button>}{query && <button type="button" onClick={() => update('q', '')}>“{query}”<X /></button>}</div>}</div>

        {!loading && !error && hiddenMatches > 0 && <div className="search-hidden-matches" role="status"><p>{hiddenMatches} matching {hiddenMatches === 1 ? 'product is' : 'products are'} hidden by your department or price filters.</p><button type="button" className="button primary" onClick={searchAllProducts}>Search all products</button></div>}
        {loading ? <p className="catalogue-state">Loading the live catalogue…</p> : error ? <div className="empty-state compact"><h2>Catalogue unavailable</h2><p>{error}</p><button type="button" className="button primary" onClick={() => void refresh()}>Try again</button></div> : visible.length ? <><div className="product-grid shop-product-grid">{pageProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div>{pageCount > 1 && <nav className="catalogue-pagination" aria-label="Catalogue pages"><button type="button" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)}>Previous</button><div className="page-numbers">{paginationItems.map((pageNumber, index) => <span className="page-number-group" key={pageNumber}>{index > 0 && pageNumber - paginationItems[index - 1] > 1 ? <i aria-hidden="true">…</i> : null}<button type="button" className={pageNumber === currentPage ? 'active' : ''} aria-label={`Go to page ${pageNumber}`} aria-current={pageNumber === currentPage ? 'page' : undefined} onClick={() => goToPage(pageNumber)}>{pageNumber}</button></span>)}</div><button type="button" disabled={currentPage === pageCount} onClick={() => goToPage(currentPage + 1)}>Next</button></nav>}</> : <div className="empty-state compact"><h2>{products.length ? 'No exact matches yet' : 'No products published yet'}</h2><p>{products.length ? 'Try another search or clear your filters.' : 'Verified products added in Admin will appear here.'}</p>{products.length > 0 && <button type="button" className="button primary" onClick={clearFilters}>Clear filters <ArrowRight /></button>}</div>}
      </section>
    </div>
  </main>;
}
