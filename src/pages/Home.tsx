import { ArrowRight, BadgeCheck, Banknote, CheckCircle2, PackageCheck, SearchCheck, ShieldCheck, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { money } from '../data/products';
import { useCatalog } from '../state/CatalogContext';

export default function Home() {
  const { products, settings, loading, error, refresh } = useCatalog();
  const featured = products[0];
  const categories = [...new Set(products.map((product) => product.category))].slice(0, 3);
  return <>
    <section className="hero">
      <div className="hero-content">
        <p className="kicker"><span>Local finds</span> · Straightforward shopping</p>
        <h1>Good deals,<br /><em>checked properly.</em></h1>
        <p className="hero-lead">Useful products at considered prices. We personally confirm supplier stock and cost before you pay—so there are no checkout surprises.</p>
        <div className="hero-actions"><Link className="button primary" to="/shop">Shop the latest finds <ArrowRight size={18} /></Link><a className="text-link" href="#how">See how it works</a></div>
        <div className="hero-trust"><span><ShieldCheck /> Secure payment link</span><span><PackageCheck /> Stock checked first</span><span><Truck /> Nationwide delivery</span></div>
      </div>
      <div className="hero-art" aria-label="Featured products">
        <div className="sun-shape" />
        <div className="hero-product-placeholder"><small>{featured ? 'Latest live product' : 'Catalogue'}</small><strong>{featured?.brand || 'MOYA'}</strong><span>{featured?.name || 'No products published yet'}</span><em>{featured?.model || 'Add products in Admin'}</em></div>
        {featured && <div className="deal-card"><small>Current selling price</small><strong>{money(featured.price)}</strong><span>{featured.name}</span></div>}
        <div className="check-card"><BadgeCheck /><div><strong>Live catalogue</strong><span>Published from the admin database</span></div></div>
      </div>
    </section>

    <section className="category-strip">
      <p>Browse by category</p>
      {categories.map((category) => <Link key={category} to={`/shop?category=${encodeURIComponent(category)}`}><i>✦</i><div><strong>{category}</strong><span>View live products</span></div><ArrowRight /></Link>)}
      {!loading && categories.length === 0 && <p>No categories are published yet.</p>}
    </section>

    <section className="section products-section">
      <div className="section-heading"><div><p className="kicker">Freshly checked</p><h2>Good finds, right now.</h2></div><Link className="text-link" to="/shop">Shop all products <ArrowRight size={17} /></Link></div>
      {loading && <p className="catalogue-state">Loading the live catalogue…</p>}
      {!loading && error && <div className="empty-state compact"><h3>Catalogue unavailable</h3><p>{error}</p><button type="button" className="button primary" onClick={() => void refresh()}>Try again</button></div>}
      {!loading && !error && products.length > 0 && <div className="product-grid">{products.slice(0, 6).map((product) => <ProductCard key={product.id} product={product} />)}</div>}
      {!loading && !error && products.length === 0 && <div className="empty-state compact"><h3>No products published yet</h3><p>Products will appear here after they are verified and published in Admin.</p></div>}
    </section>

    <section className="how-section" id="how">
      <div className="how-intro"><p className="kicker">A calmer way to shop</p><h2>Request now.<br /><em>Pay once it's checked.</em></h2><p>We source promotional finds from trusted South African retailers, then do the final checks ourselves.</p></div>
      <div className="steps">
        <div><span>01</span><SearchCheck /><h3>Find something useful</h3><p>Browse our small, carefully selected range and request what you need.</p></div>
        <div><span>02</span><CheckCircle2 /><h3>We check it properly</h3><p>Our team confirms the exact model, live supplier price and stock.</p></div>
        <div><span>03</span><Banknote /><h3>Pay securely</h3><p>We send a secure Yoco or Paystack link only after your quote is confirmed.</p></div>
        <div><span>04</span><Truck /><h3>We get it to you</h3><p>We purchase, pack and keep you updated through nationwide delivery.</p></div>
      </div>
    </section>

    <section className="delivery-banner" id="delivery"><div><Truck /></div><div><p className="kicker">Delivery, made simple</p><h2>{settings ? `Free delivery from ${money(settings.freeDeliveryThreshold)}.` : 'Delivery calculated from live settings.'}</h2><p>{settings ? `For smaller orders, ${money(settings.standardCustomerDelivery)} delivery is added.` : 'Current delivery charges appear once store settings load.'} No hidden costs.</p></div><Link className="button cream" to="/shop">Start shopping <ArrowRight size={18} /></Link></section>
  </>;
}
