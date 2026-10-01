import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Minus, Plus, ShieldCheck, Truck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { money } from '../data/products';
import { useStore } from '../state/StoreContext';
import { useFeedback } from '../components/FeedbackProvider';
import { useCatalog } from '../state/CatalogContext';
import ProductVisual from '../components/ProductVisual';

export default function ProductDetail() {
  const { slug } = useParams();
  const { products, settings, loading } = useCatalog();
  const product = products.find((item) => item.slug === slug);
  const [quantity, setQuantity] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const { add } = useStore();
  const { notify } = useFeedback();
  const navigate = useNavigate();
  useEffect(() => { setImageIndex(0); setZoomed(false); }, [slug]);
  useEffect(() => { const close = (event: KeyboardEvent) => event.key === 'Escape' && setZoomed(false); window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, []);
  if (loading) return <div className="empty-state"><p>Loading product…</p></div>;
  if (!product) return <div className="empty-state"><h1>Product not found</h1><p>This product is not currently published.</p><Link to="/shop">Back to shop</Link></div>;
  const addToCart = () => { add(product, quantity); notify(`${quantity} × ${product.name} added to your cart.`, 'success', 'Added to cart'); navigate('/cart'); };
  const images = product.images?.length ? product.images : product.image ? [{ url: product.image, altText: product.name }] : [];
  const selectedImage = images[Math.min(imageIndex, images.length - 1)];
  const moveImage = (step: number) => setImageIndex((current) => (current + step + images.length) % images.length);
  return <section className="section detail-page">
    <Link className="back-link" to="/shop"><ArrowLeft size={17} /> Back to shop</Link>
    <div className="detail-grid">
      <div className="product-gallery"><div className="detail-image" style={{ background: product.accent }}>{selectedImage ? <button type="button" className="gallery-main" onClick={() => setZoomed(true)} aria-label="Open full-size product image"><img src={selectedImage.url} alt={selectedImage.altText} /></button> : <ProductVisual product={product} large />}{images.length > 1 && <><button type="button" className="gallery-arrow previous" onClick={() => moveImage(-1)} aria-label="Previous product image"><ChevronLeft /></button><button type="button" className="gallery-arrow next" onClick={() => moveImage(1)} aria-label="Next product image"><ChevronRight /></button><span className="gallery-count">{imageIndex + 1} / {images.length}</span></>}<span className="product-badge">{product.badge}</span></div>{images.length > 1 && <div className="gallery-thumbnails" aria-label="Product images">{images.map((image, index) => <button type="button" className={index === imageIndex ? 'active' : ''} key={`${image.url}-${index}`} onClick={() => setImageIndex(index)} aria-label={`View product image ${index + 1}`}><img src={image.url} alt="" /></button>)}</div>}</div>
      <div className="detail-copy">
        <p className="eyebrow">{product.category} · {product.brand}</p><h1>{product.name}</h1><p className="detail-model">{product.model} · {product.packSize}</p>
        <div className="detail-price"><strong>{money(product.price)}</strong>{product.compareAt && <del>{money(product.compareAt)}</del>}</div>
        <div className="availability"><CheckCircle2 /><div><strong>Stock confirmed before payment</strong><span>Submit a request and we'll check the supplier's current checkout price and availability.</span></div></div>
        <p className="detail-description">{product.description}</p>
        <div className="spec-list">{Object.entries(product.specs).map(([key, value]) => <div key={key}><span>{key}</span><strong>{value}</strong></div>)}</div>
        <div className="buy-row"><div className="qty"><button type="button" aria-label="Decrease quantity" onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus /></button><span>{quantity}</span><button type="button" aria-label="Increase quantity" onClick={() => setQuantity(quantity + 1)}><Plus /></button></div><button type="button" className="button primary grow" onClick={addToCart}>Add to cart</button></div>
        <div className="detail-benefits"><span><Truck /> {settings ? product.price * quantity >= settings.freeDeliveryThreshold ? 'Free delivery' : `Free delivery from ${money(settings.freeDeliveryThreshold)}` : 'Delivery calculated at checkout'}</span><span><ShieldCheck /> Secure payment link after checks</span></div>
      </div>
    </div>
    {zoomed && selectedImage && <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="Full-size product image" onClick={() => setZoomed(false)}><button type="button" aria-label="Close full-size image"><X /></button><img src={selectedImage.url} alt={selectedImage.altText} onClick={(event) => event.stopPropagation()} /></div>}
  </section>;
}
