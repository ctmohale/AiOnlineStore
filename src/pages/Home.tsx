import { ArrowRight, BadgeCheck, Banknote, CheckCircle2, ChevronLeft, ChevronRight, PackageCheck, Pause, Play, SearchCheck, ShieldCheck, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { money } from '../data/products';
import { useCatalog } from '../state/CatalogContext';
import { categorySummaries } from '../lib/categories';

export default function Home() {
  const { products, settings, loading, error, refresh } = useCatalog();
  const featuredProducts = products.slice(0, 5);
  const [activeSlide, setActiveSlide] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const featured = featuredProducts[activeSlide];
  const categories = categorySummaries(products).slice(0, 3);
  useEffect(() => { if (activeSlide >= featuredProducts.length) setActiveSlide(0); }, [activeSlide, featuredProducts.length]);
  useEffect(() => {
    if (featuredProducts.length < 2 || !autoplay) return;
    const timer = window.setInterval(() => setActiveSlide((current) => (current + 1) % featuredProducts.length), 5500);
    return () => window.clearInterval(timer);
  }, [autoplay, featuredProducts.length]);
  const moveSlide = (direction: number) => setActiveSlide((current) => (current + direction + featuredProducts.length) % featuredProducts.length);
  return <>
    <section className="hero">
      <div className="hero-content">
        <p className="kicker"><span>Local finds</span> · Straightforward shopping</p>
        <h1>Good deals,<br /><em>checked properly.</em></h1>
        <p className="hero-lead">Useful products at considered prices. We personally confirm supplier stock and cost before you pay—so there are no checkout surprises.</p>
        <div className="hero-actions"><Link className="button primary" to="/shop">Shop the latest finds <ArrowRight size={18} /></Link><a className="text-link" href="#how">See how it works</a></div>
        <div className="hero-trust"><span><ShieldCheck /> Secure payment link</span><span><PackageCheck /> Stock checked first</span><span><Truck /> Nationwide delivery</span></div>
      </div>
      <div className="hero-art featured-showcase" role="region" aria-roledescription="carousel" aria-label="Featured products">
        <div className="sun-shape" />
        {featured ? <div className="featured-slide" key={featured.id} aria-live="polite">
          {featured.image ? <Link className="hero-feature-image" to={`/product/${featured.slug}`} aria-label={`View ${featured.name}`}><img src={featured.image} alt={featured.name} decoding="async" fetchPriority="high" draggable={false} /></Link> : <Link className="hero-product-placeholder" to={`/product/${featured.slug}`} aria-label={`View ${featured.name}`}><small>Featured find</small><strong>{featured.brand || 'MOYA'}</strong><span>{featured.name}</span><em>{featured.model || featured.packSize}</em></Link>}
          <Link className="deal-card" to={`/product/${featured.slug}`}><small>{featured.compareAt ? `Was ${money(featured.compareAt)}` : 'Current selling price'}</small><strong>{money(featured.price)}</strong><span>{featured.name}</span></Link>
          <div className="check-card"><BadgeCheck /><div><strong>Supplier checked</strong><span>{[featured.category, featured.packSize].filter(Boolean).join(' · ')}</span></div></div>
        </div> : <div className="featured-empty"><small>Featured finds</small><strong>{loading ? 'Finding something good…' : 'New finds coming soon.'}</strong><span>{loading ? 'Loading our latest verified products.' : 'We’re preparing the next carefully checked selection.'}</span><Link className="text-link" to="/shop">Browse the catalogue <ArrowRight /></Link></div>}
        {featuredProducts.length > 1 && <div className="featured-controls" aria-label="Featured product controls">
          <button type="button" onClick={() => moveSlide(-1)} aria-label="Previous featured product"><ChevronLeft /></button>
          <div>{featuredProducts.map((product, index) => <button type="button" className={index === activeSlide ? 'active' : ''} onClick={() => setActiveSlide(index)} aria-label={`Show ${product.name}`} aria-current={index === activeSlide ? 'true' : undefined} key={product.id} />)}</div>
          <button type="button" onClick={() => moveSlide(1)} aria-label="Next featured product"><ChevronRight /></button>
          <button type="button" onClick={() => setAutoplay((playing) => !playing)} aria-label={autoplay ? 'Pause featured product slideshow' : 'Play featured product slideshow'}>{autoplay ? <Pause /> : <Play />}</button>
        </div>}
      </div>
    </section>

    <section className="category-strip">
      <p>Browse by category</p>
      {categories.map((category) => <Link key={category.name} to={`/shop?category=${encodeURIComponent(category.name)}`}><i>✦</i><div><strong>{category.name}</strong><span>{category.count} live products</span></div><ArrowRight /></Link>)}
      {!loading && categories.length === 0 && <p>New categories are coming soon.</p>}
    </section>

    <section className="section products-section">
      <div className="section-heading"><div><p className="kicker">Freshly checked</p><h2>Good finds, right now.</h2></div><Link className="text-link" to="/shop">Shop all products <ArrowRight size={17} /></Link></div>
      {loading && <p className="catalogue-state">Loading the live catalogue…</p>}
      {!loading && error && <div className="empty-state compact"><h3>Catalogue unavailable</h3><p>{error}</p><button type="button" className="button primary" onClick={() => void refresh()}>Try again</button></div>}
      {!loading && !error && products.length > 0 && <div className="product-grid">{products.slice(0, 6).map((product) => <ProductCard key={product.id} product={product} />)}</div>}
      {!loading && !error && products.length === 0 && <div className="empty-state compact"><h3>New finds are coming soon</h3><p>Our team is preparing the next carefully checked selection.</p></div>}
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
