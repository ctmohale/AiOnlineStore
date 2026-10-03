import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole, Truck } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { money } from '../data/products';
import { createOrder, getShippingRates, type ShippingRate } from '../lib/api';
import { useStore } from '../state/StoreContext';
import { useFeedback } from '../components/FeedbackProvider';
import { useCatalog } from '../state/CatalogContext';
import { deliveryEstimate } from '../../shared/delivery';
import { getCustomerToken } from '../lib/storage';

const provinces = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];

export default function Checkout() {
  const { cart, subtotal, clear } = useStore();
  const { settings } = useCatalog();
  const fallbackDelivery = settings ? subtotal >= settings.freeDeliveryThreshold ? 0 : settings.standardCustomerDelivery : 0;
  const delivery = selectedShipping ? (settings && subtotal >= settings.freeDeliveryThreshold ? 0 : selectedShipping.totalPrice) : fallbackDelivery;
  const navigate = useNavigate();
  const { confirm, notify } = useFeedback();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [province, setProvince] = useState('');
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<ShippingRate | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const signedIn = Boolean(getCustomerToken());
  const timing = cart.map(({ product }) => deliveryEstimate({ retailer: product.retailer, fulfilmentType: product.fulfilmentType, stockStatus: product.stockStatus, province }));
  const deliveryMin = timing.length ? Math.max(...timing.map((item) => item.totalMinDays)) : 0;
  const deliveryMax = timing.length ? Math.max(...timing.map((item) => item.totalMaxDays)) : 0;
  if (!cart.length) return <section className="section empty-state"><h1>Your cart is empty</h1><Link className="button primary" to="/shop">Browse products</Link></section>;
  const calculateShipping = async (form: HTMLFormElement) => {
    if (!settings) return;
    const fields = new FormData(form);
    const text = (name: string) => String(fields.get(name) || '').trim();
    const customer = { name: text('name'), email: text('email'), phone: text('phone'), addressLine1: text('addressLine1'), suburb: text('suburb'), city: text('city'), province: text('province'), postalCode: text('postalCode'), notes: text('notes') };
    if (!customer.name || !customer.email || !customer.phone || !customer.addressLine1 || !customer.suburb || !customer.city || !customer.province || !/^\d{4}$/.test(customer.postalCode)) return notify('Complete your delivery address before calculating courier options.', 'warning');
    setRatesLoading(true); setError('');
    try {
      const result = await getShippingRates({ customer, items: cart.map(({ product, quantity }) => ({ productId: product.id, quantity, agreedUnitPrice: product.price })), shipping: selectedShipping ? { providerSlug: selectedShipping.providerSlug, serviceLevelCode: selectedShipping.serviceLevelCode, serviceName: selectedShipping.serviceName, quotedAmount: selectedShipping.totalPrice } : undefined });
      setShippingRates(result.rates);
      setSelectedShipping(result.rates[0] || null);
      if (!result.rates.length) notify('Live courier rates are not available right now. The standard delivery charge will be used.', 'warning');
    } catch (requestError) { const message = requestError instanceof Error ? requestError.message : 'Courier rates could not be loaded'; setError(message); notify(message, 'error'); }
    finally { setRatesLoading(false); }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return notify('Store delivery settings are still loading. Please try again in a moment.', 'warning');
    // React clears currentTarget after the first await. Capture the form and its
    // values before opening the asynchronous confirmation dialog.
    const fields = new FormData(event.currentTarget);
    if (!await confirm({ title: testMode ? 'Create a test order?' : 'Send this order request?', message: testMode ? `Simulate an order for ${money(subtotal + delivery)}? No real payment or fulfilment will take place.` : `Submit your request for ${money(subtotal + delivery)}? You will not be charged now.`, confirmLabel: testMode ? 'Create test order' : 'Send request' })) return;
    setSubmitting(true); setError('');
    const text = (name: string) => String(fields.get(name) || '').trim();
    try {
      const { reference } = await createOrder({ testMode, customer: { name: text('name'), email: text('email'), phone: text('phone'), addressLine1: text('addressLine1'), suburb: text('suburb'), city: text('city'), province: text('province'), postalCode: text('postalCode'), notes: text('notes') }, items: cart.map(({ product, quantity }) => ({ productId: product.id, quantity, agreedUnitPrice: product.price })) });
      clear(); notify(`Order request ${reference} was received.`, 'success', 'Request sent'); navigate(`/confirmation/${reference}${testMode ? '?test=1' : ''}`);
    } catch (requestError) { const message = requestError instanceof Error ? requestError.message : 'Something went wrong. Please try again.'; setError(message); notify(message, 'error'); setSubmitting(false); }
  };
  return <section className="section checkout-page">
    <Link className="back-link" to="/cart"><ArrowLeft size={17} /> Back to cart</Link>
    <div className="checkout-header"><p className="kicker">No payment yet</p><h1>Tell us where<br /><em>to deliver.</em></h1><p>We'll use these details to prepare your order and arrange nationwide delivery.</p></div>
    <div className="checkout-layout">
      <form className="request-form" onSubmit={submit}><h2>Your details</h2><div className="field-row"><label>Full name<input name="name" required autoComplete="name" placeholder="e.g. Nomsa Dlamini" /></label><label>Phone number<input name="phone" required autoComplete="tel" pattern="[0-9+ ]{9,15}" placeholder="e.g. 082 123 4567" /></label></div><label>Email address<input name="email" type="email" required autoComplete="email" placeholder="you@example.com" /></label><h2>Delivery address</h2><label>Street address<input name="addressLine1" required autoComplete="street-address" placeholder="House number and street" /></label><div className="field-row"><label>Suburb<input name="suburb" required /></label><label>City / town<input name="city" required /></label></div><div className="field-row"><label>Province<select name="province" required value={province} onChange={(event) => setProvince(event.target.value)}><option value="" disabled>Select province</option>{provinces.map((item) => <option key={item}>{item}</option>)}</select></label><label>Postal code<input name="postalCode" required inputMode="numeric" pattern="[0-9]{4}" /></label></div>{province && <div className="checkout-delivery-estimate"><Truck /><p><strong>{deliveryMin}–{deliveryMax} business days estimated</strong><span>Includes order preparation, processing and courier delivery to {province}.</span></p></div>}<div className="shipping-options"><div className="shipping-options-head"><div><strong>Courier delivery</strong><span>Get live Bob Go courier options for this address.</span></div><button type="button" className="button secondary" disabled={ratesLoading} onClick={(event) => calculateShipping(event.currentTarget.form!)}>{ratesLoading ? 'Calculating…' : 'Calculate delivery'}</button></div>{shippingRates.length > 0 && <div className="shipping-rate-list">{shippingRates.map((rate) => <label className={selectedShipping?.providerSlug === rate.providerSlug && selectedShipping?.serviceLevelCode === rate.serviceLevelCode ? 'shipping-rate selected' : 'shipping-rate'} key={`${rate.providerSlug}-${rate.serviceLevelCode}-${rate.totalPrice}`}><input type="radio" name="shippingRate" checked={selectedShipping?.providerSlug === rate.providerSlug && selectedShipping?.serviceLevelCode === rate.serviceLevelCode} onChange={() => setSelectedShipping(rate)} /><span><strong>{rate.providerName}</strong><small>{rate.serviceName}</small></span><b>{money(rate.totalPrice)}</b></label>)}</div>}</div><label>Order notes <span>(optional)</span><textarea name="notes" rows={4} placeholder="Access instructions, preferred contact time, or anything else we should know" /></label><label className="terms-consent"><input type="checkbox" required /> <span>I agree to the <Link to="/terms">Terms</Link> and acknowledge the <Link to="/privacy">Privacy Notice</Link>, <Link to="/delivery-policy">Delivery Policy</Link> and <Link to="/returns-refunds">Returns Policy</Link>.</span></label>{signedIn && <label className="test-order-option"><input type="checkbox" checked={testMode} onChange={(event) => setTestMode(event.target.checked)} /> Test order: simulate payment with no charge or fulfilment</label>}{error && <p className="form-error">{error}</p>}<button className="button primary full" disabled={submitting || !settings}>{submitting ? 'Sending request…' : !settings ? 'Loading delivery settings…' : <>Send order request <ArrowRight size={18} /></>}</button><p className="form-security"><LockKeyhole size={16} /> Protected by HTTPS. Mzansi Mega Store does not collect or store card details.</p></form>
      <aside className="checkout-summary"><h2>Your request</h2>{cart.map(({ product, quantity }) => <div className="checkout-item" key={product.id}><div className="checkout-item-image" style={{background:product.accent}}>{product.image?<img src={product.image} alt={product.name}/>:<b>{product.brand.slice(0,1)}</b>}</div><span className="item-count">{quantity}</span><div><strong>{product.name}</strong>{product.packSize && <span>{product.packSize}</span>}</div><b>{money(product.price * quantity)}</b></div>)}<hr /><div><span>Subtotal</span><b>{money(subtotal)}</b></div><div><span>Delivery</span><b>{delivery ? money(delivery) : 'Free'}</b></div><div className="checkout-total"><span>Estimated total</span><b>{money(subtotal + delivery)}</b></div><div className="check-message"><CheckCircle2 /><p><strong>Your order details</strong><span>Review your items, total and delivery information before submitting.</span></p></div></aside>
    </div>
  </section>;
}
