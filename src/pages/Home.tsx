import { ArrowRight, BadgeCheck, Banknote, CheckCircle2, PackageCheck, SearchCheck, ShieldCheck, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { products } from '../data/products';

export default function Home() {
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
        <div className="hero-product-placeholder"><small>Featured find</small><strong>WAHL</strong><span>Cutek Hairdryer</span><em>WH5439-216</em></div>
        <div className="deal-card"><small>This week's find</small><strong>Save R150</strong><span>Wahl Cutek Hairdryer</span></div>
        <div className="check-card"><BadgeCheck /><div><strong>Checked today</strong><span>Price &amp; availability</span></div></div>
      </div>
    </section>

    <section className="category-strip">
      <p>Browse by category</p>
      {[['Hair & beauty', 'Everyday styling essentials', '✦', 'Hair care'], ['Baby', 'Value packs for little ones', '◡', 'Baby'], ['Home grooming', 'Neat cuts, made simple', '⌁', 'Grooming']].map(([title, desc, icon, category]) =>
        <Link key={title} to={`/shop?category=${encodeURIComponent(category)}`}><i>{icon}</i><div><strong>{title}</strong><span>{desc}</span></div><ArrowRight /></Link>)}
    </section>

    <section className="section products-section">
      <div className="section-heading"><div><p className="kicker">Freshly checked</p><h2>Good finds, right now.</h2></div><Link className="text-link" to="/shop">Shop all products <ArrowRight size={17} /></Link></div>
      <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>
      <p className="demo-note">Demo prices shown for workflow testing. Final supplier pricing is always verified before payment.</p>
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

    <section className="delivery-banner" id="delivery"><div><Truck /></div><div><p className="kicker">Delivery, made simple</p><h2>Free delivery from R999.</h2><p>For smaller orders, a clear R89 delivery fee is added. No hidden costs.</p></div><Link className="button cream" to="/shop">Start shopping <ArrowRight size={18} /></Link></section>
  </>;
}
