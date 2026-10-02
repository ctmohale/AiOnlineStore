import { ArrowLeft, ArrowRight, Minus, Plus, ShoppingBag, Trash2, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money } from '../data/products';
import { useStore } from '../state/StoreContext';
import { useFeedback } from '../components/FeedbackProvider';
import { useCatalog } from '../state/CatalogContext';

export default function Cart() {
  const { cart, subtotal, update, remove } = useStore();
  const { settings } = useCatalog();
  const { confirm, notify } = useFeedback();
  const delivery = settings ? subtotal >= settings.freeDeliveryThreshold ? 0 : settings.standardCustomerDelivery : 0;
  const estimate = cart.reduce((current, item) => Math.max(current, item.product.deliveryEstimate?.totalMaxDays || 12), 0);
  if (!cart.length) return <section className="section empty-state"><ShoppingBag size={48} /><h1>Your cart is ready for a good find.</h1><p>Add a product and come back when you're ready to request an order.</p><Link className="button primary" to="/shop">Browse products</Link></section>;
  const removeProduct = async (productId: number, productName: string) => {
    if (!await confirm({ title: 'Remove this item?', message: `Remove “${productName}” from your cart?`, confirmLabel: 'Remove item', tone: 'danger' })) return;
    remove(productId); notify(`${productName} was removed from your cart.`, 'success', 'Item removed');
  };
  return <section className="section cart-page">
    <Link className="back-link" to="/shop"><ArrowLeft size={17} /> Keep shopping</Link>
    <div className="page-title"><p className="kicker">Your selection</p><h1>Cart <em>review.</em></h1><p>Review your items and delivery estimate before continuing.</p></div>
    <div className="cart-layout">
      <div className="cart-lines">{cart.map(({ product, quantity }) => <article className="cart-line" key={product.id}>
        <div className="cart-thumb" style={{ background: product.accent }}>{product.image ? <img src={product.image} alt="" /> : <b>{product.brand.slice(0, 1)}</b>}</div>
        <div className="cart-name"><span>{product.category}</span><h3>{product.name}</h3>{product.packSize && <p>{product.packSize}</p>}<button type="button" onClick={() => void removeProduct(product.id, product.name)}><Trash2 size={15} /> Remove</button></div>
        <div className="qty"><button type="button" aria-label={`Decrease ${product.name} quantity`} onClick={() => update(product.id, quantity - 1)}><Minus /></button><span>{quantity}</span><button type="button" aria-label={`Increase ${product.name} quantity`} onClick={() => update(product.id, quantity + 1)}><Plus /></button></div>
        <strong className="line-total">{money(product.price * quantity)}</strong>
      </article>)}</div>
      <aside className="order-summary"><h2>Request summary</h2><div><span>Products</span><strong>{money(subtotal)}</strong></div><div><span>Delivery charge</span><strong>{settings ? delivery === 0 ? 'Free' : money(delivery) : 'Loading…'}</strong></div><div><span>Delivery time</span><strong>Up to {estimate} business days</strong></div>{settings && subtotal < settings.freeDeliveryThreshold && <div className="delivery-progress"><Truck size={18} /><p>Add <strong>{money(settings.freeDeliveryThreshold - subtotal)}</strong> more for free delivery.</p><i><span style={{ width: `${Math.min(100, subtotal / settings.freeDeliveryThreshold * 100)}%` }} /></i></div>}<div className="summary-total"><span>Estimated total</span><strong>{settings ? money(subtotal + delivery) : 'Loading…'}</strong></div><p className="summary-note">The item with the longest delivery window sets the estimate. Final delivery details are provided before payment.</p><Link className="button primary full" to="/request">Request this order <ArrowRight size={18} /></Link><span className="no-charge">No payment required now</span></aside>
    </div>
  </section>;
}
