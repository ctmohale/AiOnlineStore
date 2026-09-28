import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { money } from '../data/products';
import { createOrder } from '../lib/api';
import { useStore } from '../state/StoreContext';
import { useFeedback } from '../components/FeedbackProvider';
import { useCatalog } from '../state/CatalogContext';

const provinces = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];

export default function Checkout() {
  const { cart, subtotal, clear } = useStore();
  const { settings } = useCatalog();
  const delivery = settings ? subtotal >= settings.freeDeliveryThreshold ? 0 : settings.standardCustomerDelivery : 0;
  const navigate = useNavigate();
  const { confirm, notify } = useFeedback();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [testMode, setTestMode] = useState(false);
  const signedIn = Boolean(localStorage.getItem('moya-customer-token'));
  if (!cart.length) return <section className="section empty-state"><h1>Your cart is empty</h1><Link className="button primary" to="/shop">Browse products</Link></section>;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return notify('Store delivery settings are still loading. Please try again in a moment.', 'warning');
    // React clears currentTarget after the first await. Capture the form and its
    // values before opening the asynchronous confirmation dialog.
    const fields = new FormData(event.currentTarget);
    if (!await confirm({ title: testMode ? 'Create a test order?' : 'Send this order request?', message: testMode ? `Simulate an order for ${money(subtotal + delivery)}? No real payment or fulfilment will take place.` : `Submit your request for ${money(subtotal + delivery)}? You will not be charged now; stock, price and delivery will be confirmed first.`, confirmLabel: testMode ? 'Create test order' : 'Send request' })) return;
    setSubmitting(true); setError('');
    const text = (name: string) => String(fields.get(name) || '').trim();
    try {
      const { reference } = await createOrder({ testMode, customer: { name: text('name'), email: text('email'), phone: text('phone'), addressLine1: text('addressLine1'), suburb: text('suburb'), city: text('city'), province: text('province'), postalCode: text('postalCode'), notes: text('notes') }, items: cart.map(({ product, quantity }) => ({ productId: product.id, quantity, agreedUnitPrice: product.price })) });
      clear(); notify(`Order request ${reference} was received.`, 'success', 'Request sent'); navigate(`/confirmation/${reference}${testMode ? '?test=1' : ''}`);
    } catch (requestError) { const message = requestError instanceof Error ? requestError.message : 'Something went wrong. Please try again.'; setError(message); notify(message, 'error'); setSubmitting(false); }
  };
  return <section className="section checkout-page">
    <Link className="back-link" to="/cart"><ArrowLeft size={17} /> Back to cart</Link>
    <div className="checkout-header"><p className="kicker">No payment yet</p><h1>Tell us where<br /><em>to deliver.</em></h1><p>We'll use these details to confirm stock, price and delivery before sending a secure payment link.</p></div>
    <div className="checkout-layout">
      <form className="request-form" onSubmit={submit}><h2>Your details</h2><div className="field-row"><label>Full name<input name="name" required autoComplete="name" placeholder="e.g. Nomsa Dlamini" /></label><label>Phone number<input name="phone" required autoComplete="tel" pattern="[0-9+ ]{9,15}" placeholder="e.g. 082 123 4567" /></label></div><label>Email address<input name="email" type="email" required autoComplete="email" placeholder="you@example.com" /></label><h2>Delivery address</h2><label>Street address<input name="addressLine1" required autoComplete="street-address" placeholder="House number and street" /></label><div className="field-row"><label>Suburb<input name="suburb" required /></label><label>City / town<input name="city" required /></label></div><div className="field-row"><label>Province<select name="province" required defaultValue=""><option value="" disabled>Select province</option>{provinces.map((province) => <option key={province}>{province}</option>)}</select></label><label>Postal code<input name="postalCode" required inputMode="numeric" pattern="[0-9]{4}" /></label></div><label>Order notes <span>(optional)</span><textarea name="notes" rows={4} placeholder="Access instructions, preferred contact time, or anything else we should know" /></label>{signedIn && <label className="test-order-option"><input type="checkbox" checked={testMode} onChange={(event) => setTestMode(event.target.checked)} /> Test order: simulate payment with no charge or fulfilment</label>}{error && <p className="form-error">{error}</p>}<button className="button primary full" disabled={submitting || !settings}>{submitting ? 'Sending request…' : !settings ? 'Loading delivery settings…' : <>Send order request <ArrowRight size={18} /></>}</button><p className="form-security"><LockKeyhole size={16} /> Your details are only used to process this order.</p></form>
      <aside className="checkout-summary"><h2>Your request</h2>{cart.map(({ product, quantity }) => <div className="checkout-item" key={product.id}><span className="item-count">{quantity}</span><div><strong>{product.name}</strong><span>{product.model}</span></div><b>{money(product.price * quantity)}</b></div>)}<hr /><div><span>Subtotal</span><b>{money(subtotal)}</b></div><div><span>Delivery</span><b>{delivery ? money(delivery) : 'Free'}</b></div><div className="checkout-total"><span>Estimated total</span><b>{money(subtotal + delivery)}</b></div><div className="check-message"><CheckCircle2 /><p><strong>We'll confirm this total</strong><span>Prices and availability can change at the supplier. You decide whether to pay after our check.</span></p></div></aside>
    </div>
  </section>;
}
