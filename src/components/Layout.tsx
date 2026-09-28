import { Menu, Search, ShoppingBag, UserRound, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useStore } from '../state/StoreContext';
import { useCatalog } from '../state/CatalogContext';
import { money } from '../data/products';

export default function Layout() {
  const { count } = useStore();
  const { products, settings } = useCatalog();
  const categories = [...new Set(products.map((product) => product.category))].slice(0, 2);
  const [menu, setMenu] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const search = (event: FormEvent) => {
    event.preventDefault();
    navigate(`/shop?q=${encodeURIComponent(query)}`);
  };
  return <div className="site-shell">
    <div className="announcement">Order today, pay only after we confirm stock &amp; price{settings && <><span>•</span> Free delivery from {money(settings.freeDeliveryThreshold)}</>}</div>
    <header className="site-header">
      <Link className="brand" to="/" aria-label="Moya Market home">
        <span className="brand-mark">m</span><span>moya</span><small>market</small>
      </Link>
      <form className="header-search" onSubmit={search}>
        <Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search products" placeholder="Search products, brands and more" />
      </form>
      <nav className={menu ? 'main-nav open' : 'main-nav'}>
        <NavLink to="/shop" onClick={() => setMenu(false)}>Shop</NavLink>
        {categories.map((category) => <NavLink key={category} to={`/shop?category=${encodeURIComponent(category)}`} onClick={() => setMenu(false)}>{category}</NavLink>)}
        <a href="#how" onClick={() => setMenu(false)}>How it works</a>
      </nav>
      <Link className="account-link" to="/account" aria-label="Customer account"><UserRound size={20} /><span>Sign in</span></Link>
      <Link className="cart-link" to="/cart" aria-label={`Cart with ${count} items`}><ShoppingBag size={21} /><span>Cart</span>{count > 0 && <b>{count}</b>}</Link>
      <button className="menu-button" onClick={() => setMenu(!menu)} aria-label="Toggle navigation">{menu ? <X /> : <Menu />}</button>
    </header>
    <main><Outlet /></main>
    <footer>
      <div className="footer-brand"><div className="brand light"><span className="brand-mark">m</span><span>moya</span><small>market</small></div><p>Smart finds. Checked before you pay.</p></div>
      <div><h4>Shop</h4><Link to="/shop">All products</Link>{categories.map((category) => <Link key={category} to={`/shop?category=${encodeURIComponent(category)}`}>{category}</Link>)}</div>
      <div><h4>Help</h4><a href="mailto:hello@moyamarket.co.za">Contact us</a><a href="#delivery">Delivery policy</a><a href="#how">How ordering works</a><Link to="/account">Customer login</Link><Link to="/admin/login">Admin login</Link></div>
      <div><h4>Good to know</h4><p>We confirm the supplier's price and stock before asking you to pay. No card details are collected here.</p></div>
      <div className="footer-bottom">© 2026 Moya Market (Pty) Ltd <span>Prices include VAT where applicable</span></div>
    </footer>
  </div>;
}
