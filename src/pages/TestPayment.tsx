import { CheckCircle2, CreditCard, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { customerRequest, testPayment, type CustomerOrder } from '../lib/api';
import { money } from '../data/products';

export default function TestPayment() {
  const { reference = '' } = useParams();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    customerRequest<CustomerOrder[]>('/orders').then((orders) => {
      const match = orders.find((item) => item.reference === reference && Boolean(item.is_test));
      if (!match) setError('This test order does not belong to your account.');
      else setOrder(match);
    }).catch(() => setError('Please sign in to the account that placed this test order.')).finally(() => setLoading(false));
  }, [reference]);

  const simulate = async (outcome: 'success' | 'failure') => {
    setProcessing(true); setError('');
    try {
      const result = await testPayment(reference, outcome);
      if (result.status === 'test_paid') setOrder((current) => current ? { ...current, status: 'test_paid' } : current);
      else setFailed(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The test could not be completed.'); }
    finally { setProcessing(false); }
  };

  return <section className="confirmation-page"><div className="confirmation-card test-payment-card">
    <CreditCard className="test-payment-icon" />
    <p className="kicker">Payment simulation</p>
    <h1>Test <em>checkout.</em></h1>
    <p>No gateway is connected. These buttons simulate a payment result; no card details or money are used, and test orders are never sent for fulfilment.</p>
    {loading ? <p>Loading your test order…</p> : error && !order ? <p className="form-error">{error}</p> : order && <>
      <div className="reference"><span>Test order · {reference}</span><strong>{money(Number(order.product_revenue) + Number(order.customer_delivery_charged))}</strong></div>
      <p>{order.item_summary}</p>
      {order.status === 'test_paid' ? <div className="test-result success"><CheckCircle2 /> Test payment successful. No money was charged.</div> : <>
        {failed && <div className="test-result failure"><XCircle /> Test payment failed. Your order remains unpaid; try again.</div>}
        {error && <p className="form-error">{error}</p>}
        <div className="test-payment-actions"><button className="button primary" disabled={processing} onClick={() => void simulate('success')}>Simulate successful payment</button><button className="outline-button" disabled={processing} onClick={() => void simulate('failure')}>Simulate failed payment</button></div>
      </>}
    </>}
    <Link className="text-link" to="/account">View order status</Link>
  </div></section>;
}
