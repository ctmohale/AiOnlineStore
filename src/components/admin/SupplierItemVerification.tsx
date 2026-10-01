import { useState } from 'react';
import { money } from '../../data/products';
import { adminRequest } from '../../lib/api';
import { useFeedback } from '../FeedbackProvider';

export type SupplierVerificationItem = {
  id: number;
  product_title_snapshot: string;
  model_snapshot: string;
  pack_size_snapshot: string;
  quantity: number;
  agreed_unit_price: number;
  supplier_retailer_snapshot: string | null;
  supplier_source_url_snapshot: string | null;
  supplier_sku_snapshot: string | null;
  supplier_unit_cost_snapshot: number | null;
  supplier_checkout_unit_cost: number | null;
  supplier_fulfilment_snapshot: string;
  estimated_supplier_days_min: number | null;
  estimated_supplier_days_max: number | null;
  supplier_verification_status: 'pending' | 'verified' | 'unavailable';
  verified_supplier_unit_cost: number | null;
  supplier_stock_verified_at: string | null;
  supplier_verification_notes: string | null;
};

export default function SupplierItemVerification({ orderId, item, onSaved }:{ orderId:number; item:SupplierVerificationItem; onSaved:()=>Promise<void> }) {
  const { confirm, notify } = useFeedback();
  const [cost, setCost] = useState(Number(item.verified_supplier_unit_cost ?? item.supplier_unit_cost_snapshot ?? 0));
  const [notes, setNotes] = useState(item.supplier_verification_notes || '');
  const [status, setStatus] = useState(item.supplier_verification_status || 'pending');
  const [checkedAt, setCheckedAt] = useState(item.supplier_stock_verified_at || '');
  const [busy, setBusy] = useState(false);

  const save = async (nextStatus:'verified'|'unavailable') => {
    if (nextStatus === 'verified' && (!Number.isFinite(cost) || cost <= 0)) return notify('Enter the supplier price you confirmed.','warning');
    if (nextStatus === 'unavailable' && !await confirm({ title:'Mark item unavailable?', message:`${item.product_title_snapshot} will block this order from being quoted until it is available or replaced.`, confirmLabel:'Mark unavailable' })) return;
    setBusy(true);
    try {
      const result = await adminRequest<{ status:'verified'|'unavailable'; checkedAt:string }>(`/orders/${orderId}/items/${item.id}/supplier-verification`, { method:'PATCH', body:JSON.stringify({ status:nextStatus, verifiedSupplierUnitCost:nextStatus === 'verified' ? cost : null, notes:notes.trim() || null }) });
      setStatus(result.status); setCheckedAt(result.checkedAt);
      await onSaved();
      notify(nextStatus === 'verified' ? 'Supplier price and availability were confirmed.' : 'The unavailable item was flagged and quoting is blocked.', nextStatus === 'verified' ? 'success' : 'warning', 'Supplier check saved');
    } catch(error) { notify(error instanceof Error ? error.message : 'Supplier verification could not be saved.','error'); }
    finally { setBusy(false); }
  };

  return <article>
    <div>
      <strong>{item.product_title_snapshot} × {item.quantity}</strong>
      <span>{item.model_snapshot} · {item.pack_size_snapshot}</span>
      <small>{item.supplier_retailer_snapshot || 'Supplier not captured'} · SKU {item.supplier_sku_snapshot || 'not captured'}</small>
      <small>{item.supplier_fulfilment_snapshot?.replaceAll('_',' ') || 'fulfilment unknown'} · source in {item.estimated_supplier_days_min ?? '?'}–{item.estimated_supplier_days_max ?? '?'} business days</small>
      <small>Internal check: <strong>{status}</strong>{checkedAt ? ` · ${new Date(checkedAt).toLocaleString('en-ZA')}` : ''}</small>
      <label>Checked supplier unit cost<div className="money-input">R <input type="number" min="0.01" step="0.01" value={cost} onChange={(event)=>setCost(Number(event.target.value))}/></div></label>
      <label>Internal note<input value={notes} maxLength={500} onChange={(event)=>setNotes(event.target.value)} placeholder="Stock location, quantity limit or substitution note"/></label>
      <div className="order-workflow-actions">
        <button type="button" className="outline-button" disabled={busy} onClick={()=>void save('verified')}>Confirm price and stock</button>
        <button type="button" className="outline-button" disabled={busy} onClick={()=>void save('unavailable')}>Mark unavailable</button>
      </div>
    </div>
    <div>
      <strong>{money(Number(item.supplier_unit_cost_snapshot || 0) * item.quantity)}</strong>
      <small>Snapshot estimate</small>
      {item.supplier_source_url_snapshot && <a href={item.supplier_source_url_snapshot} target="_blank" rel="noreferrer">Open supplier</a>}
    </div>
  </article>;
}
