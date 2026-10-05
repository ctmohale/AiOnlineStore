import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole, Truck } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { money } from '../data/products';
import { createOrder } from '../lib/api';
import { useStore } from '../state/StoreContext';
import { useFeedback } from '../components/FeedbackProvider';
import { useCatalog } from '../state/CatalogContext';
import { deliveryEstimate } from '../../shared/delivery';

const provinces = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];

export default function Checkout() {
  const { cart, subtotal, clear } = useStore();
  const { settings } = useCatalog();
  const delivery = settings ? subtotal >= settings.freeDeliveryThreshold ? 0 : settings.standardCustomerDelivery : 0;
  const navigate = useNavigate();
  const { confirm, notify } = useFeedback();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [province, setProvince] = useState('');
  const timing = cart.map(({ product }) => deliveryEstimate({ retailer: product.retailer, fulfilmentType: product.fulfilmentType, stockStatus: product.stockStatus, province }));
  const deliveryMin = timing.length ? Math.max(...timing.map((item) => item.totalMinDays)) : 0;
  const deliveryMax = timing.length ? Math.max(...timing.map((item) => item.totalMaxDays)) : 0;
  if (!cart.length) return <section className="section empty-state"><h1>Your cart is empty</h1><Link className="button primary" to="/shop">Browse products</Link></section>;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return notify('Store delivery settings are still loading. Please try again in a moment.', 'warning');
    // React clears currentTarget after the first await. Capture the form and its
    // values before opening the asynchronous confirmation dialog.
    const fields = new FormData(event.currentTarget);
    if (!await confirm({ title: 'Continue to secure payment?', message: `Create your order for ${money(subtotal + delivery)} and continue to Yoco's secure payment page?`, confirmLabel: 'Continue to Yoco' })) return;
    setSubmitting(true); setError('');
    const text = (name: string) => String(fields.get(name) || '').trim();
    try {
      const result = await createOrder({ customer: { name: text('name'), email: text('email'), phone: text('phone'), addressLine1: text('addressLine1'), suburb: text('suburb'), city: text('city'), province: text('province'), postalCode: text('postalCode'), notes: text('notes') }, items: cart.map(({ product, quantity }) => ({ productId: product.id, quantity, agreedUnitPrice: product.price })) });
      if (result.paymentLink) {
        notify(`Order ${result.reference} is ready for secure payment.`, 'success', 'Opening Yoco');
        window.location.assign(result.paymentLink);
        return;
      }
      clear(); notify(result.paymentError || `Order ${result.reference} was received.`, 'warning', 'Payment unavailable'); navigate(`/confirmation/${result.reference}?payment=unavailable`);
    } catch (requestError) { const message = requestError instanceof Error ? requestError.message : 'Something went wrong. Please try again.'; setError(message); notify(message, 'error'); setSubmitting(false); }
  };
  return <section className="section checkout-page">
    <Link className="back-link" to="/cart"><ArrowLeft size={17} /> Back to cart</Link>
    <div className="checkout-header"><p className="kicker">Secure checkout</p><h1>Delivery details,<br /><em>then secure payment.</em></h1><p>Confirm where we should deliver, review the total and continue to Yoco's secure payment page.</p></div>
    <div className="checkout-layout">
      <form className="request-form" onSubmit={submit}><h2>Your details</h2><div className="field-row"><label>Full name<input name="name" required autoComplete="name" placeholder="e.g. Nomsa Dlamini" /></label><label>Phone number<input name="phone" required autoComplete="tel" pattern="[0-9+ ]{9,15}" placeholder="e.g. 082 123 4567" /></label></div><label>Email address<input name="email" type="email" required autoComplete="email" placeholder="you@example.com" /></label><h2>Delivery address</h2><label>Street address<input name="addressLine1" required autoComplete="street-address" placeholder="House number and street" /></label><div className="field-row"><label>Suburb<input name="suburb" required /></label><label>City / town<input name="city" required /></label></div><div className="field-row"><label>Province<select name="province" required value={province} onChange={(event) => setProvince(event.target.value)}><option value="" disabled>Select province</option>{provinces.map((item) => <option key={item}>{item}</option>)}</select></label><label>Postal code<input name="postalCode" required inputMode="numeric" pattern="[0-9]{4}" /></label></div>{province && <div className="checkout-delivery-estimate"><Truck /><p><strong>{deliveryMin}–{deliveryMax} business days estimated</strong><span>Includes order preparation, processing and courier delivery to {province}.</span></p></div>}<label>Order notes <span>(optional)</span><textarea name="notes" rows={4} placeholder="Access instructions, preferred contact time, or anything else we should know" /></label><label className="terms-consent"><input type="checkbox" required /> <span>I agree to the <Link to="/terms">Terms</Link> and acknowledge the <Link to="/privacy">Privacy Notice</Link>, <Link to="/delivery-policy">Delivery Policy</Link> and <Link to="/returns-refunds">Returns Policy</Link>.</span></label>{error && <p className="form-error">{error}</p>}<button className="button primary full" disabled={submitting || !settings}>{submitting ? 'Opening secure payment…' : !settings ? 'Loading delivery settings…' : <>Continue to secure payment <ArrowRight size={18} /></>}</button><p className="form-security"><LockKeyhole size={16} /> Payment is securely processed by Yoco. Mzansi Mega Store never stores your card details.</p></form>
      <aside className="checkout-summary"><h2>Your order</h2>{cart.map(({ product, quantity }) => <div className="checkout-item" key={product.id}><div className="checkout-item-image" style={{background:product.accent}}>{product.image?<img src={product.image} alt={product.name}/>:<b>{product.brand.slice(0,1)}</b>}</div><span className="item-count">{quantity}</span><div><strong>{product.name}</strong>{product.packSize && <span>{product.packSize}</span>}</div><b>{money(product.price * quantity)}</b></div>)}<hr /><div><span>Subtotal</span><b>{money(subtotal)}</b></div><div><span>Delivery</span><b>{delivery ? money(delivery) : 'Free'}</b></div><div className="checkout-total"><span>Total to pay</span><b>{money(subtotal + delivery)}</b></div><div className="check-message"><CheckCircle2 /><p><strong>Secure payment with Yoco</strong><span>After confirming your details, you will complete payment on Yoco's protected checkout page.</span></p></div></aside>
    </div>
  </section>;
}
