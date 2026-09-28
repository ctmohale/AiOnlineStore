import { Edit3, RefreshCw, Search, Users, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { adminRequest } from '../../lib/api';
import { useFeedback } from '../FeedbackProvider';

type AdminCustomer = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
  order_count: number | string;
  last_order_at: string | null;
};

export default function CustomerManager() {
  const { confirm, notify } = useFeedback();
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [editing, setEditing] = useState<AdminCustomer | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (showSuccess = false) => {
    setLoading(true);
    try {
      setCustomers(await adminRequest<AdminCustomer[]>('/customers'));
      if (showSuccess) notify('Customer profiles are up to date.', 'success', 'Customers refreshed');
    } catch (error) { notify(error instanceof Error ? error.message : 'Customers could not be loaded', 'error'); }
    finally { setLoading(false); }
  }, [notify]);

  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => {
    const value = search.trim().toLowerCase();
    return value ? customers.filter((customer) => `${customer.name} ${customer.email} ${customer.phone || ''}`.toLowerCase().includes(value)) : customers;
  }, [customers, search]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    const data = new FormData(event.currentTarget);
    const newPassword = String(data.get('newPassword') || '');
    if (!await confirm({ title: newPassword ? 'Update profile and password?' : 'Update customer profile?', message: newPassword ? `This will update ${editing.name}'s details and replace their password.` : `Save the edited account details for ${editing.name}?`, confirmLabel: 'Save customer' })) return;
    setSaving(true);
    try {
      const updated = await adminRequest<{ id: number; name: string; email: string; phone: string | null }>(`/customers/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ name: data.get('name'), email: data.get('email'), phone: data.get('phone'), newPassword }) });
      setCustomers((current) => current.map((customer) => customer.id === editing.id ? { ...customer, ...updated, updated_at: new Date().toISOString() } : customer));
      setEditing(null); notify(newPassword ? 'The customer profile and password were updated.' : 'The customer profile was updated.', 'success', 'Customer updated');
    } catch (error) { notify(error instanceof Error ? error.message : 'The customer could not be updated', 'error'); }
    finally { setSaving(false); }
  };

  return <section className="admin-card table-card customer-manager">
    <div className="card-heading"><div><p className="kicker">Customer accounts</p><h2>Manage profiles</h2></div><div className="product-actions"><label className="customer-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customers" aria-label="Search customers" /></label><button type="button" className="outline-button" disabled={loading} onClick={() => void load(true)}><RefreshCw /> {loading ? 'Refreshing…' : 'Refresh'}</button></div></div>
    {loading ? <p className="table-loading">Loading customer profiles…</p> : visible.length ? <div className="data-table"><div className="table-head customer-table-grid"><span>Customer</span><span>Phone</span><span>Orders</span><span>Joined</span><span>Last order</span><span>Actions</span></div>{visible.map((customer) => <div className="table-row customer-table-grid" key={customer.id}><span><i className="table-thumb">{customer.name.slice(0, 1).toUpperCase()}</i><b>{customer.name}<small>{customer.email}</small></b></span><span>{customer.phone || 'Not provided'}</span><strong>{Number(customer.order_count)}</strong><span>{new Date(customer.created_at).toLocaleDateString('en-ZA')}</span><span>{customer.last_order_at ? new Date(customer.last_order_at).toLocaleDateString('en-ZA') : 'No orders'}</span><span className="row-actions"><button type="button" onClick={() => setEditing(customer)} aria-label={`Edit ${customer.name}`}><Edit3 /> Edit</button></span></div>)}</div> : <div className="admin-empty"><Users /><p>{customers.length ? 'No customers match your search.' : 'No customer accounts have been created yet.'}</p></div>}
    {editing && <div className="product-modal-backdrop"><section className="product-modal customer-modal" role="dialog" aria-modal="true" aria-labelledby="customer-modal-title"><header><div><p className="kicker">Customer account</p><h2 id="customer-modal-title">Edit {editing.name}</h2></div><button type="button" onClick={() => setEditing(null)} aria-label="Close customer editor"><X /></button></header><form onSubmit={save}><div className="product-form-grid"><label>Full name<input name="name" defaultValue={editing.name} required minLength={2} /></label><label>Email address<input name="email" type="email" defaultValue={editing.email} required /></label><label>Phone number<input name="phone" defaultValue={editing.phone || ''} pattern="[0-9+ ]{9,15}" /></label><label>New temporary password <span>Leave blank to keep the current password</span><input name="newPassword" type="password" minLength={10} maxLength={128} autoComplete="new-password" /></label></div><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setEditing(null)}>Cancel</button><button className="solid-button" disabled={saving}>{saving ? 'Saving…' : 'Save customer'}</button></div></form></section></div>}
  </section>;
}
