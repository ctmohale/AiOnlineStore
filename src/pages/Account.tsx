import { ArrowRight, CreditCard, KeyRound, LockKeyhole, LogOut, PackageSearch, Save, ShieldCheck, UserRound } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import StatusPill from '../components/StatusPill';
import { money } from '../data/products';
import { customerLogin, customerRegister, customerRequest, type Customer, type CustomerOrder } from '../lib/api';
import { CUSTOMER_TOKEN_KEY, getCustomerToken } from '../lib/storage';
import { publicOrderStatus } from '../lib/orderStatus';
import { useFeedback } from '../components/FeedbackProvider';

export default function Account() {
  const { confirm, notify } = useFeedback();
  const location = useLocation();
  const navigate = useNavigate();
  const search = new URLSearchParams(location.search);
  const requestedReturnTo = search.get('returnTo') || '';
  const returnTo = requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//') ? requestedReturnTo : '';
  const [mode, setMode] = useState<'login' | 'register'>(search.get('mode') === 'register' ? 'register' : 'login');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(Boolean(getCustomerToken()));
  const [submitting, setSubmitting] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState('');
  const paymentResult = new URLSearchParams(window.location.search).get('payment');

  const loadAccount = async () => {
    try {
      const [profile, orderRows] = await Promise.all([customerRequest<Customer>('/me'), customerRequest<CustomerOrder[]>('/orders')]);
      setCustomer(profile); setOrders(orderRows);
    } catch (accountError) {
      if (accountError instanceof Error && 'status' in accountError && accountError.status === 401) {
        localStorage.removeItem(CUSTOMER_TOKEN_KEY); setCustomer(null); setOrders([]);
      } else {
        setError('Order status could not be refreshed. Please try again.');
      }
    }
    finally { setLoading(false); }
  };
  useEffect(() => { if (getCustomerToken()) void loadAccount(); }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const result = mode === 'login'
        ? await customerLogin(String(data.get('email')), String(data.get('password')))
        : await customerRegister(String(data.get('name')), String(data.get('email')), String(data.get('phone')), String(data.get('password')));
      localStorage.setItem(CUSTOMER_TOKEN_KEY, result.token);
      setCustomer(result.customer);
      await loadAccount();
      notify(mode === 'login' ? 'You are signed in.' : 'Your account was created.', 'success');
      if (returnTo) navigate(returnTo, { replace: true });
    } catch (authError) { const message = authError instanceof Error ? authError.message : 'Unable to continue'; setError(message); notify(message, 'error'); }
    finally { setSubmitting(false); }
  };
  const logout = async () => { if (!await confirm({ title: 'Sign out?', message: 'You can sign in again at any time to view your order requests.', confirmLabel: 'Sign out' })) return; localStorage.removeItem(CUSTOMER_TOKEN_KEY); setCustomer(null); setOrders([]); notify('You have been signed out.', 'success'); };
  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!await confirm({ title: 'Update your profile?', message: 'Your name, email address and phone number will be updated for future account activity.', confirmLabel: 'Update profile' })) return;
    setSavingProfile(true); setError('');
    try {
      const result = await customerRequest<{ customer: Customer; token: string }>('/me', { method: 'PATCH', body: JSON.stringify({ name: data.get('name'), email: data.get('email'), phone: data.get('phone') }) });
      localStorage.setItem(CUSTOMER_TOKEN_KEY, result.token); setCustomer(result.customer); notify('Your profile details were updated.', 'success', 'Profile updated');
    } catch (profileError) { const message = profileError instanceof Error ? profileError.message : 'Your profile could not be updated'; setError(message); notify(message, 'error'); }
    finally { setSavingProfile(false); }
  };
  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const newPassword = String(data.get('newPassword') || '');
    if (newPassword !== String(data.get('confirmPassword') || '')) return notify('The new passwords do not match.', 'warning', 'Check password');
    if (!await confirm({ title: 'Change your password?', message: 'Your new password will be required the next time you sign in.', confirmLabel: 'Change password' })) return;
    setSavingPassword(true); setError('');
    try {
      await customerRequest('/password', { method: 'PATCH', body: JSON.stringify({ currentPassword: data.get('currentPassword'), newPassword }) });
      form.reset(); notify('Your password was changed securely.', 'success', 'Password updated');
    } catch (passwordError) { const message = passwordError instanceof Error ? passwordError.message : 'Your password could not be changed'; setError(message); notify(message, 'error'); }
    finally { setSavingPassword(false); }
  };

  if (loading) return <section className="section account-loading">Loading your account…</section>;
  if (customer) return <section className="section account-page">
    {paymentResult && <div className={`payment-return ${paymentResult}`}><CreditCard /><div><strong>{paymentResult === 'success' ? 'Payment submitted securely' : paymentResult === 'cancelled' ? 'Payment was cancelled' : 'Payment was not completed'}</strong><span>{paymentResult === 'success' ? 'Yoco will confirm the payment here automatically. Refresh if the status still says awaiting payment.' : 'Your order remains safe. Use the secure payment button on the order when you are ready to try again.'}</span></div></div>}
    <div className="account-heading"><div><p className="kicker">Customer account</p><h1>Hello, <em>{customer.name.split(' ')[0]}.</em></h1><p>{customer.email}{customer.phone ? ` · ${customer.phone}` : ''}</p></div><button type="button" className="outline-button" onClick={() => void logout()}><LogOut /> Sign out</button></div>
    <div className="account-settings-grid">
      <form className="account-panel account-settings-card" onSubmit={saveProfile}><div className="card-heading"><div><p className="kicker">Your details</p><h2>Profile information</h2></div><UserRound /></div><label>Full name<input name="name" defaultValue={customer.name} required minLength={2} autoComplete="name" /></label><label>Email address<input name="email" type="email" defaultValue={customer.email} required autoComplete="email" /></label><label>Phone number<input name="phone" defaultValue={customer.phone || ''} pattern="[0-9+ ]{9,15}" autoComplete="tel" /></label><button className="solid-button" disabled={savingProfile}><Save /> {savingProfile ? 'Saving…' : 'Save profile'}</button></form>
      <form className="account-panel account-settings-card" onSubmit={changePassword}><div className="card-heading"><div><p className="kicker">Account security</p><h2>Change password</h2></div><KeyRound /></div><label>Current password<input name="currentPassword" type="password" required autoComplete="current-password" /></label><label>New password<input name="newPassword" type="password" required minLength={10} maxLength={128} autoComplete="new-password" /></label><label>Confirm new password<input name="confirmPassword" type="password" required minLength={10} maxLength={128} autoComplete="new-password" /></label><button className="solid-button" disabled={savingPassword}><KeyRound /> {savingPassword ? 'Changing…' : 'Change password'}</button></form>
    </div>
    {error && <p className="form-error account-error">{error}</p>}
    <div className="account-panel"><div className="card-heading"><div><p className="kicker">Your activity</p><h2>Order requests</h2></div><div className="account-actions"><button className="outline-button" type="button" onClick={() => { setError(''); void loadAccount(); }}>Refresh status</button><Link className="button primary" to="/shop">Shop now <ArrowRight /></Link></div></div>
      {orders.length ? <div className="customer-orders">{orders.map((order) => <article key={order.reference}><div><strong>{order.reference}</strong><span>{order.item_summary}</span><span>Ordered {new Date(order.created_at).toLocaleDateString('en-ZA', { dateStyle: 'medium' })}</span>{order.expected_delivery_at && !['delivered','cancelled','refunded'].includes(order.status) && <span className="order-eta">Estimated delivery {new Date(order.expected_delivery_at).toLocaleDateString('en-ZA', { dateStyle: 'medium' })}</span>}{order.delivered_at && <span className="order-eta">Delivered {new Date(order.delivered_at).toLocaleDateString('en-ZA', { dateStyle: 'medium' })}</span>}{order.status === 'awaiting_payment' && order.payment_link && <a className="customer-pay-button" href={order.payment_link}>Pay securely with {order.payment_provider === 'yoco' ? 'Yoco' : 'the payment provider'} <ArrowRight /></a>}</div><div className="customer-order-progress" aria-label={`Order status: ${publicOrderStatus(order.status)}`}><span>{publicOrderStatus(order.status)}</span>{order.tracking_number && <span className="customer-tracking">{order.courier_name}: {order.tracking_url ? <a href={order.tracking_url} target="_blank" rel="noopener noreferrer">Track {order.tracking_number}</a> : order.tracking_number}</span>}</div><StatusPill status={order.status} label={publicOrderStatus(order.status)} /><strong>{money(Number(order.product_revenue) + Number(order.customer_delivery_charged))}</strong></article>)}</div> : <div className="account-empty"><PackageSearch /><h3>No orders yet</h3><p>Your completed checkout orders will appear here with payment and delivery updates.</p><Link className="text-link" to="/shop">Browse the latest finds <ArrowRight /></Link></div>}
    </div>
  </section>;

  return <section className="account-auth"><div className="account-benefits"><span className="account-icon"><UserRound /></span><p className="kicker">Customer account</p><h1>Keep your orders<br /><em>in one place.</em></h1><p>Sign in or create your customer profile before checkout, then track payment and delivery progress from your account.</p><div><span><PackageSearch /> Track order status</span><span><ShieldCheck /> Secure account access</span><span><LockKeyhole /> No card details stored</span></div></div>
    <form className="account-form" onSubmit={submit}><div className="account-tabs"><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button><button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Create account</button></div><h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2><p>{returnTo ? (mode === 'login' ? 'Sign in to continue securely to checkout.' : 'Create your profile to continue securely to checkout.') : (mode === 'login' ? 'Access your Mzansi Mega Store orders.' : 'It only takes a minute.')}</p>{mode === 'register' && <><label>Full name<input name="name" autoComplete="name" required minLength={2} /></label><label>Phone number<input name="phone" autoComplete="tel" required pattern="[0-9+ ]{9,15}" placeholder="082 123 4567" /></label></>}<label>Email address<input name="email" type="email" autoComplete="email" required /></label><label>Password<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 10 : 1} /></label>{mode === 'register' && <small>Use at least 10 characters.</small>}{error && <p className="form-error">{error}</p>}<button className="button primary full" disabled={submitting}>{submitting ? 'Please wait…' : <>{mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight /></>}</button><p className="guest-note">Your profile securely connects every checkout to your order history.</p></form>
  </section>;
}
