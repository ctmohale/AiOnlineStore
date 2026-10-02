import { BadgeCheck, ChevronDown, LockKeyhole, MapPin, Menu, Search, ShoppingBag, UserRound, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../state/StoreContext';
import { useCatalog } from '../state/CatalogContext';
import { money } from '../data/products';
import { isStoreNavigationActive } from '../lib/navigation';
import { CATEGORY_NAMES, categorySummaries } from '../lib/categories';

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
    navigate(`/shop?q=${encodeURIComponent(query.trim())}`);
  };
  return <div className="site-shell">
    <div className="announcement"><MapPin /> South African online store <span>•</span> Nationwide delivery{settings && <><span>•</span> Free delivery from {money(settings.freeDeliveryThreshold)}</>}</div>
    <header className="site-header">
      <Link className="brand" to="/" aria-label="Mzansi Mega Store home">
        <span className="brand-mark" aria-hidden="true">M</span><span>zansi</span><small>Mega Store</small>
      </Link>
      <form className="header-search" role="search" onSubmit={search}>
        <Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search products" placeholder="Search products, brands and more" />
        <button type="submit" aria-label="Submit product search">Search</button>
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
    <section className="site-trust-strip"><div><BadgeCheck /><strong>Simple online ordering</strong><span>Clear product, price and delivery information</span></div><div><MapPin /><strong>Made for South Africa</strong><span>ZAR pricing and nationwide delivery</span></div><div><LockKeyhole /><strong>Protected checkout</strong><span>HTTPS and no card details stored here</span></div></section>
    <footer>
      <div className="footer-brand"><div className="brand light" role="img" aria-label="Mzansi Mega Store"><span className="brand-mark" aria-hidden="true">M</span><span>zansi</span><small>Mega Store</small></div><p>A South African online store and trading name operated by BEESTACK (PTY) LTD · Reg. 2025/361006/07.</p><Link to="/about">About Mzansi Mega Store</Link><Link to="/contact">Contact details</Link><a href="https://www.beestack.co.za/" target="_blank" rel="noreferrer">BeeStack company website</a></div>
      <div><h4>Shop</h4><Link to="/shop">All products</Link>{CATEGORY_NAMES.map((category) => <Link key={category} to={`/shop?category=${encodeURIComponent(category)}`}>{category}</Link>)}</div>
      <div><h4>Help &amp; policies</h4><Link to="/delivery-policy">Delivery policy</Link><Link to="/returns-refunds">Returns &amp; refunds</Link><Link to="/complaints">Complaints</Link><Link to="/account">Customer login</Link><Link to="/admin/login">Admin login</Link></div>
      <div><h4>Trust &amp; legal</h4><Link to="/payment-security">Payment security</Link><Link to="/privacy">Privacy notice</Link><Link to="/terms">Terms of sale</Link><p>Secure online shopping with nationwide delivery and local customer support.</p></div>
      <div className="footer-bottom">
        <div className="footer-legal"><span>© 2026 BEESTACK (PTY) LTD, trading as Mzansi Mega Store · South African online store</span><span>Prices shown in ZAR and include VAT where applicable</span></div>
        <div className="footer-payment-provider" aria-label="Supported payment methods">
          <div className="footer-payment-heading"><small>Supported payment methods</small><span>Payment links via <img src="/yoco-logo.svg" alt="Yoco" /> or <b>Paystack</b></span></div>
          <div className="footer-payment-methods">
            <img className="capitec-pay" src="/payment-capitec-pay.png" alt="Capitec Pay" />
            <img src="/payment-visa.svg" alt="Visa" />
            <img src="/payment-mastercard.svg" alt="Mastercard" />
            <img src="/payment-amex.svg" alt="American Express" />
            <img src="/payment-apple-pay.svg" alt="Apple Pay" />
            <img src="/payment-google-pay.svg" alt="Google Pay" />
          </div>
        </div>
      </div>
    </footer>
  </div>;
}
