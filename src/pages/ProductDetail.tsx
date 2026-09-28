import { ArrowLeft, CheckCircle2, Minus, Plus, ShieldCheck, Truck } from 'lucide-react';
import { useState } from 'react';
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
  const { add } = useStore();
  const { notify } = useFeedback();
  const navigate = useNavigate();
  if (loading) return <div className="empty-state"><p>Loading product…</p></div>;
  if (!product) return <div className="empty-state"><h1>Product not found</h1><p>This product is not currently published.</p><Link to="/shop">Back to shop</Link></div>;
  const addToCart = () => { add(product, quantity); notify(`${quantity} × ${product.name} added to your cart.`, 'success', 'Added to cart'); navigate('/cart'); };
  return <section className="section detail-page">
    <Link className="back-link" to="/shop"><ArrowLeft size={17} /> Back to shop</Link>
    <div className="detail-grid">
      <div className="detail-image" style={{ background: product.accent }}><span className="product-badge">{product.badge}</span><ProductVisual product={product} large /></div>
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
  </section>;
}
