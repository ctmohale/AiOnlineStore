import {
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Headphones,
  LayoutGrid,
  PackageCheck,
  Pause,
  Play,
  ShieldCheck,
  ShoppingBasket,
  Truck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import ProductVisual from '../components/ProductVisual';
import BrandShowcaseBanner from '../components/BrandShowcaseBanner';
import { money } from '../data/products';
import { CATEGORY_NAMES, FOCUSED_CATEGORIES, categorySummaries } from '../lib/categories';
import { HOME_ROTATION_MS, homeRotationBucket, homepageProductPool, rotatingProducts } from '../lib/homeRotation';
import { useCatalog } from '../state/CatalogContext';

const categoryPresentation: Record<string, { image?: string; icon?: LucideIcon; tone: string }> = {
  ...Object.fromEntries(FOCUSED_CATEGORIES.map(({ name, image }) => [name, { image, tone: 'green' }])),
  'Electronics & Computing': { image: '/category-electronics.png', tone: 'blue' },
  'Home Appliances': { image: '/category-appliances.png', tone: 'orange' },
  'Home & Furniture': { image: '/category-home-furniture.png', tone: 'green' },
  'Tools & Automotive': { image: '/category-tools-automotive.png', tone: 'gold' },
  'Outdoor & Sports': { image: '/category-outdoor-sports.png', tone: 'mint' },
  'Health, Beauty & Baby': { image: '/category-health-beauty-baby.png', tone: 'rose' },
  'Food & Household': { image: '/category-food-household.png', tone: 'yellow' },
  'Office & Stationery': { image: '/category-office-stationery.png', tone: 'slate' },
};

const heroStories = [
  {
    label: 'Big choice · Mzansi value',
    title: 'Everything you need,',
    accent: 'all in one place.',
    copy: 'Shop thousands of products for home, work and everyday life—with delivery across South Africa.',
    image: null,
    imageAlt: '',
    visualClass: '',
  },
  {
    label: 'Fast nationwide delivery',
    title: 'Mzansi on the move.',
    accent: 'Across South Africa.',
    copy: 'Clear delivery estimates and useful order updates from checkout to arrival.',
    image: '/hero-delivery-vw-van-brand.png',
    imageAlt: 'Volkswagen Crafter delivery van with Mzansi Mega Store branding',
    visualClass: 'van',
  },
  {
    label: 'Delivered to your door',
    title: 'Your order.',
    accent: 'Delivered with care.',
    copy: 'Friendly delivery and clear communication right through to the handover.',
    image: '/hero-order-handover.png',
    imageAlt: 'Mzansi Mega Store courier handing a branded parcel to a customer',
    visualClass: 'handover',
  },
] as const;

export default function Home() {
  const { products, settings, loading, error, refresh } = useCatalog();
  const [rotationBucket, setRotationBucket] = useState(() => homeRotationBucket());
  const productPool = homepageProductPool(products, 16);
  const heroProducts = rotatingProducts(productPool, 5, rotationBucket);
  const dealProducts = rotatingProducts(productPool, 5, rotationBucket, 5);
  const popularProducts = productPool.slice(0, 5);
  const hasSalesHistory = productPool.some((product) => (product.unitsSold || 0) > 0);
  const [activeSlide, setActiveSlide] = useState(0);
  const [activeStory, setActiveStory] = useState(0);
  const [storyAutoplay, setStoryAutoplay] = useState(true);
  const featured = heroProducts[activeSlide];
  const story = heroStories[activeStory];
  const categories = categorySummaries(products);
  const navigationCategories = categories.length > 0
    ? categories
    : [...CATEGORY_NAMES, ...FOCUSED_CATEGORIES.map(({ name }) => name)].map((name) => ({ name, count: 0 }));

  useEffect(() => {
    let interval: number | undefined;
    const update = () => { setRotationBucket(homeRotationBucket()); void refresh(); };
    const untilNextWindow = HOME_ROTATION_MS - Date.now() % HOME_ROTATION_MS;
    const timeout = window.setTimeout(() => {
      update();
      interval = window.setInterval(update, HOME_ROTATION_MS);
    }, untilNextWindow);
    return () => { window.clearTimeout(timeout); if (interval) window.clearInterval(interval); };
  }, [refresh]);
  useEffect(() => { setActiveSlide(0); }, [rotationBucket]);
  useEffect(() => { if (activeSlide >= heroProducts.length) setActiveSlide(0); }, [activeSlide, heroProducts.length]);
  useEffect(() => {
    if (!storyAutoplay) return;
    const timer = window.setInterval(() => setActiveStory((current) => (current + 1) % heroStories.length), 9500);
    return () => window.clearInterval(timer);
  }, [storyAutoplay]);

  const moveSlide = (direction: number) => {
    if (!heroProducts.length) return;
    setActiveSlide((current) => (current + direction + heroProducts.length) % heroProducts.length);
  };
  const moveStory = (direction: number) => setActiveStory((current) => (current + direction + heroStories.length) % heroStories.length);

  return <div className="retail-home">
    <section className="retail-department-bar" aria-label="Shop departments">
      <Link className="retail-department-title" to="/shop"><LayoutGrid /><span>Shop departments</span><ChevronRight /></Link>
      <nav aria-label="Product departments">{navigationCategories.map((category) => {
        const presentation = categoryPresentation[category.name] || categoryPresentation['Home & Furniture'];
        const Icon = presentation.icon;
        return <Link key={category.name} to={`/shop?category=${encodeURIComponent(category.name)}`}>{presentation.image ? <img src={presentation.image} alt="" /> : Icon ? <Icon /> : null}<span>{category.name}</span></Link>;
      })}</nav>
    </section>

    <section className="retail-hero" aria-label="Featured promotion">
      <div className="retail-hero-copy">
        <div className={`retail-story-slide${story.image ? ' visual' : ''}`} key={story.title} aria-live="polite">
          {story.image ? <div className={`retail-story-visual ${story.visualClass}`}>
            <img src={story.image} alt={story.imageAlt} decoding="async" />
            <div className="retail-story-caption"><div><span>{story.label}</span><h2>{story.title}<br /><em>{story.accent}</em></h2></div><p>{story.copy}</p></div>
          </div> : <>
            <span className="retail-promo-label">{story.label}</span>
            <h1>{story.title}<br /><em>{story.accent}</em></h1>
            <p>{story.copy}</p>
            <div className="retail-hero-actions">
              <Link className="retail-primary-action" to="/shop">Shop all products <ArrowRight /></Link>
              <Link className="retail-secondary-action" to="/shop">Browse great value</Link>
            </div>
            <div className="retail-hero-promises">
              <span><BadgeCheck /> Clear ZAR pricing</span>
              <span><Truck /> Nationwide delivery</span>
              <span><ShieldCheck /> Secure payment links</span>
            </div>
          </>}
        </div>
        <div className="retail-story-controls" aria-label="Store highlight controls">
          <button type="button" onClick={() => moveStory(-1)} aria-label="Previous store highlight"><ChevronLeft /></button>
          <span>{heroStories.map((item, index) => <button type="button" key={item.title} className={index === activeStory ? 'active' : ''} onClick={() => setActiveStory(index)} aria-label={`Show ${item.label}`} aria-current={index === activeStory ? 'true' : undefined} />)}</span>
          <button type="button" onClick={() => moveStory(1)} aria-label="Next store highlight"><ChevronRight /></button>
          <button type="button" onClick={() => setStoryAutoplay((playing) => !playing)} aria-label={storyAutoplay ? 'Pause store highlights' : 'Play store highlights'}>{storyAutoplay ? <Pause /> : <Play />}</button>
        </div>
      </div>
      <div className="retail-featured" aria-live="polite">
        <div className="retail-featured-brand" role="img" aria-label="Mzansi Mega Store"><span className="brand-mark" aria-hidden="true">M</span><span>zansi</span><small>Mega Store</small></div>
        {featured ? <>
          <Link className="retail-featured-visual" to={`/product/${featured.slug}`} aria-label={`View ${featured.name}`}><ProductVisual product={featured} large /></Link>
          <div className="retail-featured-copy">
            <span>{featured.compareAt ? 'Special price' : 'Featured today'}</span>
            <Link to={`/product/${featured.slug}`}><h2>{featured.name}</h2></Link>
            <p>{[featured.brand, featured.packSize].filter(Boolean).join(' · ')}</p>
            <div><strong>{money(featured.price)}</strong>{featured.compareAt && <del>{money(featured.compareAt)}</del>}</div>
            <Link to={`/product/${featured.slug}`}>View deal <ArrowRight /></Link>
          </div>
        </> : <div className="retail-featured-empty"><PackageCheck /><strong>{loading ? 'Loading today’s finds…' : 'Discover your next favourite.'}</strong><span>Browse the full catalogue for more finds.</span></div>}
        {heroProducts.length > 1 && <div className="retail-featured-controls" aria-label="Featured deals controls">
          <button type="button" onClick={() => moveSlide(-1)} aria-label="Previous deal"><ChevronLeft /></button>
          <span>{heroProducts.map((product, index) => <button type="button" key={product.id} className={index === activeSlide ? 'active' : ''} onClick={() => setActiveSlide(index)} aria-label={`Show ${product.name}`} aria-current={index === activeSlide ? 'true' : undefined} />)}</span>
          <button type="button" onClick={() => moveSlide(1)} aria-label="Next deal"><ChevronRight /></button>
        </div>}
      </div>
    </section>

    <section className="retail-benefit-bar" aria-label="Shopping benefits">
      <div><Truck /><span><strong>Delivery nationwide</strong><small>Clear estimates at checkout</small></span></div>
      <div><CreditCard /><span><strong>Secure ways to pay</strong><small>Yoco and Paystack payment links</small></span></div>
      <div><Headphones /><span><strong>Local customer support</strong><small>Help before and after your order</small></span></div>
      <div><BadgeCheck /><span><strong>Useful product details</strong><small>Shop with the information you need</small></span></div>
    </section>

    <BrandShowcaseBanner products={products} />

    <section className="retail-section retail-categories">
      <div className="retail-section-heading"><div><span>Shop by department</span><h2>Find what you need, faster.</h2></div><Link to="/shop">View all products <ArrowRight /></Link></div>
      {categories.length > 0 ? <div className="retail-category-grid">{categories.map((category) => {
        const presentation = categoryPresentation[category.name] || categoryPresentation['Home & Furniture'];
        const Icon = presentation.icon;
        return <Link className={`retail-category-card ${presentation.tone}`} key={category.name} to={`/shop?category=${encodeURIComponent(category.name)}`}>
          <span>{presentation.image ? <img src={presentation.image} alt="" loading="lazy" /> : Icon ? <Icon /> : null}</span><strong>{category.name}</strong><small>{category.count.toLocaleString('en-ZA')} products</small><ArrowRight />
        </Link>;
      })}</div> : !loading && <div className="retail-empty-line">Departments will appear when the catalogue is available.</div>}
    </section>

    <section className="retail-promo-grid" aria-label="Store promotions">
      <article className="retail-promo-card value"><div><span>Made for everyday value</span><h2>More choice.<br />Less running around.</h2><p>From appliances and technology to home essentials, browse one growing catalogue.</p><Link to="/shop">Explore the catalogue <ArrowRight /></Link></div><ShoppingBasket /></article>
      <article className="retail-promo-card delivery"><div><span>Across South Africa</span><h2>Delivery that<br />comes to you.</h2><p>{settings ? `Free delivery from ${money(settings.freeDeliveryThreshold)}. Standard delivery is ${money(settings.standardCustomerDelivery)} below the threshold.` : 'Delivery charges and estimates are shown clearly during checkout.'}</p><a href="#delivery">See delivery details <ArrowRight /></a></div><Truck /></article>
    </section>

    <section className="retail-section retail-products-section">
      <div className="retail-section-heading"><div><span>Featured savings</span><h2>Top deals for you.</h2></div><Link to="/shop">Shop all deals <ArrowRight /></Link></div>
      {loading && <p className="catalogue-state">Loading the live catalogue…</p>}
      {!loading && error && <div className="empty-state compact"><h3>Catalogue unavailable</h3><p>{error}</p><button type="button" className="button primary" onClick={() => void refresh()}>Try again</button></div>}
      {!loading && !error && dealProducts.length > 0 && <div className="retail-product-grid">{dealProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div>}
    </section>

    {!loading && !error && popularProducts.length > 0 && <section className="retail-section retail-products-section retail-products-alt">
      <div className="retail-section-heading"><div><span>{hasSalesHistory ? 'Popular right now' : 'Featured products'}</span><h2>More worth browsing.</h2></div><Link to="/shop">Browse everything <ArrowRight /></Link></div>
      <div className="retail-product-grid">{popularProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div>
    </section>}

    {!loading && !error && products.length === 0 && <section className="retail-section"><div className="empty-state compact"><h3>New finds are coming soon</h3><p>Our team is preparing the next catalogue selection.</p></div></section>}

    <section className="retail-delivery" id="delivery">
      <div><Truck /></div>
      <div><span>Simple nationwide delivery</span><h2>From our catalogue to your door.</h2><p>See your delivery estimate before placing your order, then follow progress from your customer account.</p></div>
      <Link to="/shop">Start shopping <ArrowRight /></Link>
    </section>
  </div>;
}
