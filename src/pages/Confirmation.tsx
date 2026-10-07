import { ArrowRight, Check, CreditCard, ShieldCheck, XCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../state/StoreContext';

export default function Confirmation() {
  const { reference } = useParams();
  const [searchParams] = useSearchParams();
  const { clear } = useStore();
  const payment = searchParams.get('payment');
  const cartCleared = useRef(false);
  useEffect(() => {
    if (payment === 'success' && !cartCleared.current) {
      cartCleared.current = true;
      clear();
    }
  }, [clear, payment]);
  const successful = payment === 'success';
  const cancelled = payment === 'cancelled';
  const failed = payment === 'failed';
  const unavailable = payment === 'unavailable';
  const Icon = successful ? Check : cancelled || failed ? XCircle : CreditCard;
  return <section className="confirmation-page"><div className="confirmation-card"><span className={`success-icon ${cancelled || failed || unavailable ? 'payment-not-complete' : ''}`}><Icon /></span><p className="kicker">{successful ? 'Payment sent securely' : cancelled ? 'Payment cancelled' : failed ? 'Payment unsuccessful' : unavailable ? 'Payment unavailable' : 'Order created'}</p><h1>{successful ? <>Thanks—<em>Yoco is confirming your payment.</em></> : cancelled ? <>Your payment was <em>cancelled.</em></> : failed ? <>Payment did not <em>complete.</em></> : <>Your order is <em>saved.</em></>}</h1><p>{successful ? 'This usually takes a moment. You can safely leave this page and check your order status at any time.' : cancelled || failed ? 'No successful payment was recorded. Your cart is still available so you can return to checkout and try again.' : 'Secure payment could not be opened. Please contact support with the reference below.'}</p><div className="reference"><span>Your order reference</span><strong>{reference}</strong></div>{successful && <div className="check-message"><ShieldCheck /><p><strong>Confirmation in progress</strong><span>Your order will update automatically as soon as Yoco confirms the payment.</span></p></div>}<Link className="button primary" to={successful ? '/orders' : cancelled || failed ? '/request' : '/contact'}>{successful ? 'View order status' : cancelled || failed ? 'Return to checkout' : 'Contact support'} <ArrowRight size={18} /></Link><p><Link to="/shop">Continue shopping</Link></p></div></section>;
}
