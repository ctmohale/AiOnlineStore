import { Clock3, Search, Sparkles, X } from 'lucide-react';
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Product } from '../data/products';
import { money } from '../data/products';
import { rankProductSearch } from '../lib/productSearch';

const HISTORY_KEY = 'mzansi-product-search-history-v1';
const readHistory = () => {
  try { return JSON.parse(window.localStorage.getItem(HISTORY_KEY) || '[]') as string[]; } catch { return []; }
};

export default function AdvancedSearch({ products }: { products: Product[] }) {
  const location = useLocation();
  const navigate = useNavigate();
  const root = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get('q') || '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [history, setHistory] = useState<string[]>(readHistory);
  const suggestions = useMemo(() => rankProductSearch(products, query, 6), [products, query]);
  const relatedCategories = useMemo(() => [...new Set(suggestions.map((product) => product.category).filter(Boolean))].slice(0, 3), [suggestions]);

  useEffect(() => {
    const next = new URLSearchParams(location.search).get('q');
    if (location.pathname === '/shop' && next !== null) setQuery(next);
  }, [location.pathname, location.search]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const remember = (value: string) => {
    const clean = value.trim();
    if (!clean) return;
    const next = [clean, ...history.filter((item) => item.toLowerCase() !== clean.toLowerCase())].slice(0, 5);
    setHistory(next);
    try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* storage can be disabled */ }
  };
  const searchAll = (value = query) => {
    const clean = value.trim();
    if (!clean) return;
    remember(clean);
    setOpen(false);
    setActiveIndex(-1);
    navigate(`/shop?q=${encodeURIComponent(clean)}`);
  };
  const openProduct = (product: Product) => {
    remember(query || product.name);
    setOpen(false);
    setActiveIndex(-1);
    navigate(`/product/${product.slug}`);
  };
  const submit = (event: FormEvent) => { event.preventDefault(); activeIndex >= 0 && suggestions[activeIndex] ? openProduct(suggestions[activeIndex]) : searchAll(); };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { setOpen(false); setActiveIndex(-1); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    setOpen(true);
    setActiveIndex((current) => event.key === 'ArrowDown'
      ? Math.min(current + 1, suggestions.length - 1)
      : Math.max(current - 1, -1));
  };

  const showHistory = open && !query.trim() && history.length > 0;
  const showResults = open && query.trim().length > 0;
  return <form ref={root} className={`header-search advanced-search${open ? ' open' : ''}`} role="search" onSubmit={submit}>
    <Search className="advanced-search-icon" size={18} />
    <input
      value={query}
      onFocus={() => setOpen(true)}
      onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(-1); }}
      onKeyDown={onKeyDown}
      aria-label="Search products"
      aria-expanded={open}
      aria-controls="advanced-search-panel"
      aria-autocomplete="list"
      role="combobox"
      placeholder="What are you looking for?"
      autoComplete="off"
    />
    {query && <button className="advanced-search-clear" type="button" aria-label="Clear product search" onClick={() => { setQuery(''); setOpen(true); setActiveIndex(-1); }}><X /></button>}
    <button className="advanced-search-submit" type="submit" aria-label="Submit product search">Search</button>
    {(showHistory || showResults) && <div className="advanced-search-panel" id="advanced-search-panel" role="listbox">
      {showHistory && <><div className="advanced-search-label"><Clock3 /> Recent searches</div>{history.map((item) => <button type="button" className="advanced-search-history" key={item} onClick={() => { setQuery(item); searchAll(item); }}><Clock3 /><span>{item}</span></button>)}</>}
      {showResults && suggestions.length > 0 && <>
        <div className="advanced-search-label"><Sparkles /> Best matches</div>
        {suggestions.map((product, index) => <button type="button" role="option" aria-selected={index === activeIndex} className={`advanced-search-result${index === activeIndex ? ' active' : ''}`} key={product.id} onMouseEnter={() => setActiveIndex(index)} onClick={() => openProduct(product)}>
          <span className="advanced-search-image">{product.image ? <img src={product.image} alt="" /> : product.brand.slice(0, 1)}</span>
          <span className="advanced-search-copy"><strong>{product.name}</strong><small>{[product.brand, product.category].filter(Boolean).join(' · ')}</small></span>
          <b>{money(product.price)}</b>
        </button>)}
        {relatedCategories.length > 0 && <div className="advanced-search-categories"><span>Related:</span>{relatedCategories.map((category) => <button type="button" key={category} onClick={() => { setOpen(false); navigate(`/shop?category=${encodeURIComponent(category)}`); }}>{category}</button>)}</div>}
        <button type="button" className="advanced-search-all" onClick={() => searchAll()}>See all results for “{query.trim()}”</button>
      </>}
      {showResults && suggestions.length === 0 && <div className="advanced-search-empty"><Search /><strong>No quick match yet</strong><span>Search the full catalogue for “{query.trim()}”.</span><button type="button" onClick={() => searchAll()}>Search all products</button></div>}
    </div>}
  </form>;
}
