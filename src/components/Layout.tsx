import { BadgeCheck, ChevronDown, LockKeyhole, MapPin, Menu, Search, ShoppingBag, UserRound, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../state/StoreContext';
import { useCatalog } from '../state/CatalogContext';
import { money } from '../data/products';
import { isStoreNavigationActive } from '../lib/navigation';
import { categorySummaries } from '../lib/categories';

export default function Layout() {
  const { count } = useStore();
  const { products, settings } = useCatalog();
  const categories = categorySummaries(products);
  const [menu, setMenu] = useState(false);
  const [categoryMenu, setCategoryMenu] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const selectedCategory = new URLSearchParams(location.search).get('category') || '';
  const search = (event: FormEvent) => {
    event.preventDefault();
    navigate(`/shop?q=${encodeURIComponent(query)}`);
  };
  return <div className="site-shell">
    <div className="announcement"><MapPin /> South African online store <span>•</span> Order today, pay only after we confirm stock, price &amp; delivery{settings && <><span>•</span> Free delivery from {money(settings.freeDeliveryThreshold)}</>}</div>
    <header className="site-header">
      <Link className="brand" to="/" aria-label="Mzansi Mega Store home">
        <span className="brand-mark">M</span><span>Mzansi</span><small>Mega Store</small>
      </Link>
      <form className="header-search" onSubmit={search}>
        <Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search products" placeholder="Search products, brands and more" />
      </form>
      <nav className={menu ? 'main-nav open' : 'main-nav'}>
        <Link className={isStoreNavigationActive(location.pathname, selectedCategory) ? 'active' : ''} aria-current={isStoreNavigationActive(location.pathname, selectedCategory) ? 'page' : undefined} to="/shop" onClick={() => { setMenu(false); setCategoryMenu(false); }}>Shop</Link>
        <div className="category-navigation">
          <button type="button" className={selectedCategory ? 'active' : ''} aria-expanded={categoryMenu} aria-controls="category-navigation-menu" onClick={() => setCategoryMenu((open) => !open)}>Categories <ChevronDown /></button>
          {categoryMenu && <div className="category-navigation-menu" id="category-navigation-menu">{categories.map((category) => { const active = isStoreNavigationActive(location.pathname, selectedCategory, category.name); return <Link className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} key={category.name} to={`/shop?category=${encodeURIComponent(category.name)}`} onClick={() => { setCategoryMenu(false); setMenu(false); }}><span>{category.name}</span><small>{category.count} products</small></Link>; })}</div>}
        </div>
      </nav>
      <Link className="account-link" to="/account" aria-label="Customer account"><UserRound size={20} /><span>Sign in</span></Link>
      <Link className="cart-link" to="/cart" aria-label={`Cart with ${count} items`}><ShoppingBag size={21} /><span>Cart</span>{count > 0 && <b>{count}</b>}</Link>
      <button className="menu-button" onClick={() => { setMenu(!menu); if (menu) setCategoryMenu(false); }} aria-label="Toggle navigation">{menu ? <X /> : <Menu />}</button>
    </header>
    <main><Outlet /></main>
    <section className="site-trust-strip"><div><BadgeCheck /><strong>Checked before payment</strong><span>Current stock, price and delivery confirmed</span></div><div><MapPin /><strong>Made for South Africa</strong><span>ZAR pricing and nationwide delivery</span></div><div><LockKeyhole /><strong>Protected checkout</strong><span>HTTPS and no card details stored here</span></div></section>
    <footer>
      <div className="footer-brand"><div className="brand light"><span className="brand-mark">M</span><span>Mzansi</span><small>Mega Store</small></div><p>A South African online store and trading name operated by BEESTACK (PTY) LTD · Reg. 2025/361006/07.</p><Link to="/about">About Mzansi Mega Store</Link><Link to="/contact">Contact details</Link><a href="https://www.beestack.co.za/" target="_blank" rel="noreferrer">BeeStack company website</a></div>
      <div><h4>Shop</h4><Link to="/shop">All products</Link>{categories.slice(0, 5).map((category) => <Link key={category.name} to={`/shop?category=${encodeURIComponent(category.name)}`}>{category.name}</Link>)}</div>
      <div><h4>Help &amp; policies</h4><Link to="/delivery-policy">Delivery policy</Link><Link to="/returns-refunds">Returns &amp; refunds</Link><Link to="/complaints">Complaints</Link><Link to="/account">Customer login</Link><Link to="/admin/login">Admin login</Link></div>
      <div><h4>Trust &amp; legal</h4><Link to="/payment-security">Payment security</Link><Link to="/privacy">Privacy notice</Link><Link to="/terms">Terms of sale</Link><p>Independent reseller. Game and Makro are source retailers, not affiliated partners.</p></div>
      <div className="footer-bottom">© 2026 BEESTACK (PTY) LTD, trading as Mzansi Mega Store · South African online store <span>Prices shown in ZAR and include VAT where applicable</span></div>
    </footer>
  </div>;
}
