import { ArrowLeft, CheckCircle2, Minus, Plus, ShieldCheck, Truck } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FREE_DELIVERY_THRESHOLD, money, products } from '../data/products';
import { useStore } from '../state/StoreContext';
import { useFeedback } from '../components/FeedbackProvider';

export default function ProductDetail() {
  const { slug } = useParams();
  const product = products.find((item) => item.slug === slug);
  const [quantity, setQuantity] = useState(1);
  const { add } = useStore();
  const { notify } = useFeedback();
  const navigate = useNavigate();
  if (!product) return <div className="empty-state"><h1>Product not found</h1><Link to="/shop">Back to shop</Link></div>;
  const addToCart = () => { add(product, quantity); notify(`${quantity} × ${product.name} added to your cart.`, 'success', 'Added to cart'); navigate('/cart'); };
  return <section className="section detail-page">
    <Link className="back-link" to="/shop"><ArrowLeft size={17} /> Back to shop</Link>
    <div className="detail-grid">
      <div className="detail-image" style={{ background: product.accent }}><span className="product-badge">{product.badge}</span>{product.image ? <img src={product.image} alt={product.name} /> : <span className="product-placeholder large"><small>Product image coming soon</small><b>{product.brand}</b><em>{product.model}</em></span>}</div>
      <div className="detail-copy">
        <p className="eyebrow">{product.category} · {product.brand}</p><h1>{product.name}</h1><p className="detail-model">{product.model} · {product.packSize}</p>
        <div className="detail-price"><strong>{money(product.price)}</strong>{product.compareAt && <del>{money(product.compareAt)}</del>}</div>
        <div className="availability"><CheckCircle2 /><div><strong>Stock confirmed before payment</strong><span>Submit a request and we'll check the supplier's current checkout price and availability.</span></div></div>
        <p className="detail-description">{product.description}</p>
        <div className="spec-list">{Object.entries(product.specs).map(([key, value]) => <div key={key}><span>{key}</span><strong>{value}</strong></div>)}</div>
        <div className="buy-row"><div className="qty"><button type="button" aria-label="Decrease quantity" onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus /></button><span>{quantity}</span><button type="button" aria-label="Increase quantity" onClick={() => setQuantity(quantity + 1)}><Plus /></button></div><button type="button" className="button primary grow" onClick={addToCart}>Add to cart</button></div>
        <div className="detail-benefits"><span><Truck /> {product.price * quantity >= FREE_DELIVERY_THRESHOLD ? 'Free delivery' : 'Free delivery from R999'}</span><span><ShieldCheck /> Secure payment link after checks</span></div>
      </div>
    </div>
  </section>;
}
