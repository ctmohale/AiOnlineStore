import { useState } from 'react';
import { adminRequest } from '../../lib/api';
import { useFeedback } from '../FeedbackProvider';

export type WorkflowOrder = {
  id?: number;
  ref: string;
  status: string;
  customer: string;
  email: string;
  phone: string;
  address: string;
  courierName?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  isTest: boolean;
};

const nextStatuses: Record<string, { status: string; label: string }[]> = {
  requested: [{ status: 'checking_supplier', label: 'Start supplier check' }, { status: 'cancelled', label: 'Cancel order' }],
  checking_supplier: [{ status: 'cancelled', label: 'Cancel order' }],
  quoted: [{ status: 'cancelled', label: 'Cancel order' }],
  awaiting_payment: [{ status: 'cancelled', label: 'Cancel order' }],
  paid: [{ status: 'purchasing', label: 'Mark purchasing' }, { status: 'refunded', label: 'Mark refunded' }],
  purchasing: [{ status: 'shipped', label: 'Mark shipped' }, { status: 'refunded', label: 'Mark refunded' }],
  shipped: [{ status: 'delivered', label: 'Mark delivered' }, { status: 'refunded', label: 'Mark refunded' }],
  delivered: [{ status: 'refunded', label: 'Mark refunded' }],
};

export default function OrderWorkflow({ order, onChanged }: { order?: WorkflowOrder; onChanged: () => Promise<void> }) {
  const { confirm, notify } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [courierName, setCourierName] = useState(order?.courierName || '');
  const [trackingNumber, setTrackingNumber] = useState(order?.trackingNumber || '');
  const [trackingUrl, setTrackingUrl] = useState(order?.trackingUrl || '');
  if (!order) return <p className="quote-warning">Select a real order to see its customer details and next steps.</p>;
  const move = async (status: string, label: string) => {
    if (status === 'shipped' && (!courierName.trim() || !trackingNumber.trim())) return notify('Enter the courier and tracking number before marking this order shipped.', 'warning');
    if (!order.id || !await confirm({ title: `${label}?`, message: `Move ${order.ref} from ${order.status.replaceAll('_', ' ')} to ${status.replaceAll('_', ' ')}? The customer will see the new status in their account.`, confirmLabel: label })) return;
    setBusy(true);
    try {
      await adminRequest(`/orders/${order.id}/status`, { method: 'PATCH', body: JSON.stringify({ status, ...(status === 'shipped' ? { courierName: courierName.trim(), trackingNumber: trackingNumber.trim(), trackingUrl: trackingUrl.trim() || undefined } : {}) }) });
      await onChanged();
      notify(`${order.ref} is now ${status.replaceAll('_', ' ')}.`, 'success');
    } catch (error) { notify(error instanceof Error ? error.message : 'Status could not be updated.', 'error'); }
    finally { setBusy(false); }
  };
  return <section className="order-workflow">
    <h3>Customer and delivery</h3>
    <p><strong>{order.customer}</strong><br /><a href={`mailto:${order.email}`}>{order.email}</a> · {order.phone}</p>
    <p>{order.address}</p>
    <h3>Next step</h3>
    {order.status === 'purchasing' && <div className="order-tracking-inputs"><label>Courier<input value={courierName} onChange={(event) => setCourierName(event.target.value)} placeholder="Courier name" /></label><label>Tracking number<input value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} placeholder="Shipment reference" /></label><label>Tracking link (optional)<input type="url" value={trackingUrl} onChange={(event) => setTrackingUrl(event.target.value)} placeholder="https://courier.example/track" /></label></div>}
    {order.isTest ? <p>Test order. No purchase, shipment or real payment is allowed.</p> : (nextStatuses[order.status] || []).length
      ? <div className="order-workflow-actions">{nextStatuses[order.status].map(({ status, label }) => <button key={status} type="button" className="outline-button" disabled={busy} onClick={() => void move(status, label)}>{label}</button>)}</div>
      : <p>No further status changes are available.</p>}
    {order.status === 'quoted' && <p className="quote-warning">A payment link requires a configured real gateway. Verify the transaction with the provider before marking it paid.</p>}
  </section>;
}
