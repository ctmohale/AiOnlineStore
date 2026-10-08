import { ArrowRight, Check, CreditCard, ShieldCheck, XCircle } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

export default function Confirmation() {
  const { reference } = useParams();
  const [searchParams] = useSearchParams();
  const payment = searchParams.get('payment');
  const successful = payment === 'success';
  const cancelled = payment === 'cancelled';
  const failed = payment === 'failed';
  const unavailable = payment === 'unavailable';
  const Icon = successful ? Check : cancelled || failed ? XCircle : CreditCard;
  return <section className="confirmation-page"><div className="confirmation-card"><span className={`success-icon ${cancelled || failed || unavailable ? 'payment-not-complete' : ''}`}><Icon /></span><p className="kicker">{successful ? 'Payment return received' : cancelled ? 'Checkout cancelled' : failed ? 'Payment unsuccessful' : unavailable ? 'Payment unavailable' : 'Checkout saved'}</p><h1>{successful ? <>Thanks—<em>Yoco is confirming your payment.</em></> : cancelled ? <>No order was <em>placed.</em></> : failed ? <>Payment did not <em>complete.</em></> : <>Your checkout is <em>saved.</em></>}</h1><p>{successful ? 'Your cart is not cleared by this return page. Purchased items are removed only after Yoco securely verifies the payment.' : cancelled || failed ? 'No successful payment was recorded and no confirmed order was created. Your cart stays exactly as it was so you can try again.' : 'Secure payment could not be opened. Your cart has been kept exactly as it was; please contact support with the checkout reference below.'}</p><div className="reference"><span>Checkout reference</span><strong>{reference}</strong></div>{successful && <div className="check-message"><ShieldCheck /><p><strong>Verification in progress</strong><span>A confirmed order reference is created only after Yoco’s signed payment confirmation is received.</span></p></div>}<Link className="button primary" to={successful ? '/orders' : cancelled || failed ? '/cart' : '/contact'}>{successful ? 'Check payment status' : cancelled || failed ? 'Return to cart' : 'Contact support'} <ArrowRight size={18} /></Link><p><Link to="/shop">Continue shopping</Link></p></div></section>;
}
