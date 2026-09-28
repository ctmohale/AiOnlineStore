import { ArrowLeft, ArrowRight, Minus, Plus, ShoppingBag, Trash2, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { FREE_DELIVERY_THRESHOLD, money, STANDARD_DELIVERY } from '../data/products';
import { useStore } from '../state/StoreContext';

export default function Cart() {
  const { cart, subtotal, update, remove } = useStore();
  const delivery = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : STANDARD_DELIVERY;
  if (!cart.length) return <section className="section empty-state"><ShoppingBag size={48} /><h1>Your cart is ready for a good find.</h1><p>Add a product and come back when you're ready to request an order.</p><Link className="button primary" to="/shop">Browse products</Link></section>;
  return <section className="section cart-page">
    <Link className="back-link" to="/shop"><ArrowLeft size={17} /> Keep shopping</Link>
    <div className="page-title"><p className="kicker">Your selection</p><h1>Cart <em>review.</em></h1><p>Nothing is charged yet. We'll verify everything first.</p></div>
    <div className="cart-layout">
      <div className="cart-lines">{cart.map(({ product, quantity }) => <article className="cart-line" key={product.id}>
        <div className="cart-thumb" style={{ background: product.accent }}>{product.image ? <img src={product.image} alt="" /> : <b>{product.brand.slice(0, 1)}</b>}</div>
        <div className="cart-name"><span>{product.category}</span><h3>{product.name}</h3><p>{product.model} · {product.packSize}</p><button onClick={() => remove(product.id)}><Trash2 size={15} /> Remove</button></div>
        <div className="qty"><button onClick={() => update(product.id, quantity - 1)}><Minus /></button><span>{quantity}</span><button onClick={() => update(product.id, quantity + 1)}><Plus /></button></div>
        <strong className="line-total">{money(product.price * quantity)}</strong>
      </article>)}</div>
      <aside className="order-summary"><h2>Request summary</h2><div><span>Products</span><strong>{money(subtotal)}</strong></div><div><span>Estimated delivery</span><strong>{delivery === 0 ? 'Free' : money(delivery)}</strong></div>{subtotal < FREE_DELIVERY_THRESHOLD && <div className="delivery-progress"><Truck size={18} /><p>Add <strong>{money(FREE_DELIVERY_THRESHOLD - subtotal)}</strong> more for free delivery.</p><i><span style={{ width: `${Math.min(100, subtotal / FREE_DELIVERY_THRESHOLD * 100)}%` }} /></i></div>}<div className="summary-total"><span>Estimated total</span><strong>{money(subtotal + delivery)}</strong></div><p className="summary-note">Final stock, supplier cost and delivery are checked before we send your payment link.</p><Link className="button primary full" to="/request">Request this order <ArrowRight size={18} /></Link><span className="no-charge">No payment required now</span></aside>
    </div>
  </section>;
}
