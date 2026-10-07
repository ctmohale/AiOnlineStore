import { ArrowLeft, ArrowRight, CreditCard, RefreshCw, ShoppingBag } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import StatusPill from '../components/StatusPill';
import { money } from '../data/products';
import { customerRequest, type CustomerOrder } from '../lib/api';
import { publicOrderStatus } from '../lib/orderStatus';
import { clearCustomerToken, getCustomerToken } from '../lib/storage';
import { sanitizePublicProductText } from '../../shared/public-product.js';

export default function TrackOrders() {
  const location = useLocation();
  const [authenticated, setAuthenticated] = useState(Boolean(getCustomerToken()));
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(authenticated);
  const [error, setError] = useState('');
  const paymentResult = new URLSearchParams(location.search).get('payment');

  useLayoutEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }, []);
  const loadOrders = useCallback(async () => {
    if (!getCustomerToken()) { setAuthenticated(false); setLoading(false); return; }
    setLoading(true); setError('');
    try { setOrders(await customerRequest<CustomerOrder[]>('/orders')); }
    catch (ordersError) {
      if (ordersError instanceof Error && 'status' in ordersError && ordersError.status === 401) {
        clearCustomerToken(); setAuthenticated(false);
      } else setError('Your orders could not be loaded. Please try again.');
    }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (authenticated) void loadOrders(); }, [authenticated, loadOrders]);

  if (!authenticated) return <Navigate to="/account?returnTo=%2Forders&mode=login" replace />;
  return <section className="section orders-page">
    {paymentResult && <div className={`payment-return ${paymentResult}`}><CreditCard /><div><strong>{paymentResult === 'success' ? 'Payment submitted securely' : paymentResult === 'cancelled' ? 'Payment was cancelled' : 'Payment was not completed'}</strong><span>{paymentResult === 'success' ? 'Yoco will confirm the payment automatically. Refresh if the status still says awaiting payment.' : 'Your order remains safe. Use its secure payment button when you are ready to try again.'}</span></div></div>}
    <Link className="back-link" to="/account"><ArrowLeft /> Back to profile</Link>
    <div className="orders-heading"><div><p className="kicker">Order tracking</p><h1>Your orders.</h1><p>Follow payment, preparation and delivery progress in one place.</p></div><div className="account-actions"><button className="outline-button" type="button" disabled={loading} onClick={() => void loadOrders()}><RefreshCw /> {loading ? 'Refreshing…' : 'Refresh status'}</button><Link className="button primary" to="/shop">Shop now <ArrowRight /></Link></div></div>
    {error && <p className="form-error account-error">{error}</p>}
    <div className="account-panel orders-panel">
      {loading ? <div className="account-empty"><RefreshCw className="orders-loading-icon" /><h3>Loading your orders</h3><p>Checking the latest payment and delivery status.</p></div> : orders.length ? <div className="customer-orders">{orders.map((order) => <article key={order.reference}><div><strong>{order.reference}</strong><span>{sanitizePublicProductText(order.item_summary)}</span><span>Ordered {new Date(order.created_at).toLocaleDateString('en-ZA', { dateStyle: 'medium' })}</span>{order.expected_delivery_at && !['delivered','cancelled','refunded'].includes(order.status) && <span className="order-eta">Estimated delivery {new Date(order.expected_delivery_at).toLocaleDateString('en-ZA', { dateStyle: 'medium' })}</span>}{order.delivered_at && <span className="order-eta">Delivered {new Date(order.delivered_at).toLocaleDateString('en-ZA', { dateStyle: 'medium' })}</span>}{order.status === 'awaiting_payment' && order.payment_link && <a className="customer-pay-button" href={order.payment_link}>Pay securely with {order.payment_provider === 'yoco' ? 'Yoco' : 'the payment provider'} <ArrowRight /></a>}</div>{order.tracking_number && <div className="customer-order-progress"><span className="customer-tracking">{order.courier_name}: {order.tracking_url ? <a href={order.tracking_url} target="_blank" rel="noopener noreferrer">Track {order.tracking_number}</a> : order.tracking_number}</span></div>}<StatusPill status={order.status} label={publicOrderStatus(order.status)} /><strong>{money(Number(order.product_revenue) + Number(order.customer_delivery_charged))}</strong></article>)}</div> : <div className="account-empty"><ShoppingBag /><h3>No orders yet</h3><p>Your completed checkout orders will appear here with payment and delivery updates.</p><Link className="text-link" to="/shop">Browse the latest finds <ArrowRight /></Link></div>}
    </div>
  </section>;
}
