import { ArrowRight, LockKeyhole, LogOut, PackageSearch, ShieldCheck, UserRound } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StatusPill from '../components/StatusPill';
import { money } from '../data/products';
import { customerLogin, customerRegister, customerRequest, type Customer, type CustomerOrder } from '../lib/api';

export default function Account() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('moya-customer-token')));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadAccount = async () => {
    try {
      const [profile, orderRows] = await Promise.all([customerRequest<Customer>('/me'), customerRequest<CustomerOrder[]>('/orders')]);
      setCustomer(profile); setOrders(orderRows);
    } catch { localStorage.removeItem('moya-customer-token'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (localStorage.getItem('moya-customer-token')) void loadAccount(); }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const result = mode === 'login'
        ? await customerLogin(String(data.get('email')), String(data.get('password')))
        : await customerRegister(String(data.get('name')), String(data.get('email')), String(data.get('phone')), String(data.get('password')));
      localStorage.setItem('moya-customer-token', result.token);
      setCustomer(result.customer); setOrders([]);
    } catch (authError) { setError(authError instanceof Error ? authError.message : 'Unable to continue'); }
    finally { setSubmitting(false); }
  };
  const logout = () => { localStorage.removeItem('moya-customer-token'); setCustomer(null); setOrders([]); };

  if (loading) return <section className="section account-loading">Loading your account…</section>;
  if (customer) return <section className="section account-page">
    <div className="account-heading"><div><p className="kicker">Customer account</p><h1>Hello, <em>{customer.name.split(' ')[0]}.</em></h1><p>{customer.email}{customer.phone ? ` · ${customer.phone}` : ''}</p></div><button className="outline-button" onClick={logout}><LogOut /> Sign out</button></div>
    <div className="account-panel"><div className="card-heading"><div><p className="kicker">Your activity</p><h2>Order requests</h2></div><Link className="button primary" to="/shop">Shop now <ArrowRight /></Link></div>
      {orders.length ? <div className="customer-orders">{orders.map((order) => <article key={order.reference}><div><strong>{order.reference}</strong><span>{new Date(order.created_at).toLocaleDateString('en-ZA', { dateStyle: 'medium' })}</span></div><StatusPill status={order.status} /><strong>{money(Number(order.product_revenue) + Number(order.customer_delivery_charged))}</strong></article>)}</div> : <div className="account-empty"><PackageSearch /><h3>No order requests yet</h3><p>Your signed-in requests will appear here. Guest checkout is still available.</p><Link className="text-link" to="/shop">Browse the latest finds <ArrowRight /></Link></div>}
    </div>
  </section>;

  return <section className="account-auth"><div className="account-benefits"><span className="account-icon"><UserRound /></span><p className="kicker">Customer account</p><h1>Keep your requests<br /><em>in one place.</em></h1><p>Sign in to view your order-request history. You can still shop and check out as a guest at any time.</p><div><span><PackageSearch /> Track request status</span><span><ShieldCheck /> Secure account access</span><span><LockKeyhole /> No card details stored</span></div></div>
    <form className="account-form" onSubmit={submit}><div className="account-tabs"><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button><button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Create account</button></div><h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2><p>{mode === 'login' ? 'Access your Moya Market requests.' : 'It only takes a minute.'}</p>{mode === 'register' && <><label>Full name<input name="name" autoComplete="name" required minLength={2} /></label><label>Phone number<input name="phone" autoComplete="tel" required pattern="[0-9+ ]{9,15}" placeholder="082 123 4567" /></label></>}<label>Email address<input name="email" type="email" autoComplete="email" required /></label><label>Password<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 10 : 1} /></label>{mode === 'register' && <small>Use at least 10 characters.</small>}{error && <p className="form-error">{error}</p>}<button className="button primary full" disabled={submitting}>{submitting ? 'Please wait…' : <>{mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight /></>}</button><p className="guest-note">Prefer not to register? <Link to="/shop">Continue shopping as a guest.</Link></p></form>
  </section>;
}
