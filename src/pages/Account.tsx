import { ArrowLeft, ArrowRight, KeyRound, LockKeyhole, LogOut, MailCheck, PackageSearch, RefreshCw, Save, ShieldCheck, UserRound } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { customerForgotPassword, customerLogin, customerRegister, customerRequest, customerResendVerification, customerResetPassword, customerVerifyEmail, type Customer } from '../lib/api';
import { clearCustomerToken, getCustomerToken, setCustomerToken } from '../lib/storage';
import { useFeedback } from '../components/FeedbackProvider';

export default function Account() {
  const { confirm, notify } = useFeedback();
  const location = useLocation();
  const navigate = useNavigate();
  const search = new URLSearchParams(location.search);
  const requestedReturnTo = search.get('returnTo') || '';
  const returnTo = requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//') ? requestedReturnTo : '';
  const [mode, setMode] = useState<'login' | 'register' | 'verify' | 'forgot' | 'reset'>(search.get('mode') === 'register' ? 'register' : 'login');
  const [pendingEmail, setPendingEmail] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(Boolean(getCustomerToken()));
  const [submitting, setSubmitting] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [error, setError] = useState('');

  const loadAccount = async () => {
    try {
      setCustomer(await customerRequest<Customer>('/me'));
    } catch (accountError) {
      if (accountError instanceof Error && 'status' in accountError && accountError.status === 401) {
        clearCustomerToken(); setCustomer(null);
      } else {
        setError('Your profile could not be loaded. Please try again.');
      }
    }
    finally { setLoading(false); }
  };
  useEffect(() => { if (getCustomerToken()) void loadAccount(); }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const email = String(data.get('email')).trim().toLowerCase();
      if (mode === 'register') {
        await customerRegister(String(data.get('name')), email, String(data.get('phone')), String(data.get('password')));
        setPendingEmail(email); setMode('verify');
        notify('We sent a six-digit verification code to your email.', 'success', 'Check your email');
      } else {
        const result = await customerLogin(email, String(data.get('password')));
        setCustomerToken(result.token); setCustomer(result.customer);
        await loadAccount(); notify('You are signed in.', 'success');
        if (returnTo) navigate(returnTo, { replace: true });
      }
    } catch (authError) {
      const body = authError && typeof authError === 'object' && 'body' in authError ? (authError as { body?: { verificationRequired?: boolean; email?: string } }).body : undefined;
      if (body?.verificationRequired && body.email) { setPendingEmail(body.email); setMode('verify'); }
      const message = authError instanceof Error ? authError.message : 'Unable to continue'; setError(message); notify(message, 'error');
    }
    finally { setSubmitting(false); }
  };
  const verifyEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const result = await customerVerifyEmail(pendingEmail, String(data.get('code')));
      setCustomerToken(result.token); setCustomer(result.customer);
      await loadAccount(); notify('Your email is verified and your account is ready.', 'success', 'Account confirmed');
      if (returnTo) navigate(returnTo, { replace: true });
    } catch (verifyError) { const message = verifyError instanceof Error ? verifyError.message : 'Unable to verify your email'; setError(message); notify(message, 'error'); }
    finally { setSubmitting(false); }
  };
  const resendVerification = async () => {
    setSubmitting(true); setError('');
    try { await customerResendVerification(pendingEmail); notify('A new six-digit code was sent.', 'success', 'Code sent'); }
    catch (resendError) { const message = resendError instanceof Error ? resendError.message : 'Unable to resend the code'; setError(message); notify(message, 'error'); }
    finally { setSubmitting(false); }
  };
  const requestPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setError('');
    const data = new FormData(event.currentTarget); const email = String(data.get('email')).trim().toLowerCase();
    try { await customerForgotPassword(email); setPendingEmail(email); setMode('reset'); notify('If that account exists, a reset code is on its way.', 'success', 'Check your email'); }
    catch (resetError) { const message = resetError instanceof Error ? resetError.message : 'Unable to request a reset code'; setError(message); notify(message, 'error'); }
    finally { setSubmitting(false); }
  };
  const resetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setError('');
    const data = new FormData(event.currentTarget); const password = String(data.get('newPassword'));
    if (password !== String(data.get('confirmPassword'))) { setSubmitting(false); return notify('The new passwords do not match.', 'warning', 'Check password'); }
    try { await customerResetPassword(pendingEmail, String(data.get('code')), password); setMode('login'); notify('Your password was reset. Sign in with the new password.', 'success', 'Password updated'); }
    catch (resetError) { const message = resetError instanceof Error ? resetError.message : 'Unable to reset your password'; setError(message); notify(message, 'error'); }
    finally { setSubmitting(false); }
  };
  const logout = async () => { if (!await confirm({ title: 'Sign out?', message: 'You can sign in again at any time to view your orders.', confirmLabel: 'Sign out' })) return; clearCustomerToken(); setCustomer(null); notify('You have been signed out.', 'success'); };
  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!await confirm({ title: 'Update your profile?', message: 'Your name, email address and phone number will be updated for future account activity.', confirmLabel: 'Update profile' })) return;
    setSavingProfile(true); setError('');
    try {
      const result = await customerRequest<{ customer: Customer; token: string }>('/me', { method: 'PATCH', body: JSON.stringify({ name: data.get('name'), email: data.get('email'), phone: data.get('phone') }) });
      setCustomerToken(result.token); setCustomer(result.customer); notify('Your profile details were updated.', 'success', 'Profile updated');
    } catch (profileError) { const message = profileError instanceof Error ? profileError.message : 'Your profile could not be updated'; setError(message); notify(message, 'error'); }
    finally { setSavingProfile(false); }
  };
  if (loading) return <section className="section account-loading">Loading your account…</section>;
  if (customer) return <section className="section account-page">
    <div className="account-heading"><div><p className="kicker">Customer profile</p><h1>Hello, <em>{customer.name.split(' ')[0]}.</em></h1><p>{customer.email}{customer.phone ? ` · ${customer.phone}` : ''}</p></div><div className="account-heading-actions"><Link className="outline-button" to="/orders"><PackageSearch /> Track orders</Link><button type="button" className="outline-button" onClick={() => void logout()}><LogOut /> Sign out</button></div></div>
    <div className="account-settings-grid profile-only" id="profile">
      <form className="account-panel account-settings-card" onSubmit={saveProfile}><div className="card-heading"><div><p className="kicker">Your details</p><h2>Profile information</h2></div><UserRound /></div><label>Full name<input name="name" defaultValue={customer.name} required minLength={2} autoComplete="name" /></label><label>Email address<input name="email" type="email" defaultValue={customer.email} required readOnly aria-describedby="verified-email-note" autoComplete="email" /></label><small id="verified-email-note" className="verified-email-note"><ShieldCheck /> Verified email · Contact support to change it</small><label>Phone number<input name="phone" defaultValue={customer.phone || ''} pattern="[0-9+ ]{9,15}" autoComplete="tel" /></label><button className="solid-button" disabled={savingProfile}><Save /> {savingProfile ? 'Saving…' : 'Save profile'}</button></form>
    </div>
    {error && <p className="form-error account-error">{error}</p>}
  </section>;

  const authCopy = mode === 'verify' ? { title: 'Check your email', intro: `Enter the six-digit code sent to ${pendingEmail}. It expires in 10 minutes.` }
    : mode === 'forgot' ? { title: 'Forgot your password?', intro: 'Enter your verified email and we will send a secure reset code.' }
    : mode === 'reset' ? { title: 'Choose a new password', intro: `Enter the code sent to ${pendingEmail} and create a new password.` }
    : mode === 'login' ? { title: 'Welcome back', intro: returnTo ? 'Sign in to continue securely to checkout.' : 'Access your Mzansi Mega Store orders.' }
    : { title: 'Create your account', intro: returnTo ? 'Create and verify your profile to continue securely to checkout.' : 'It only takes a minute, then verify your email.' };

  return <section className="account-auth"><div className="account-benefits"><span className="account-icon"><UserRound /></span><p className="kicker">Customer account</p><h1>Keep your orders<br /><em>in one place.</em></h1><p>Sign in or create your customer profile before checkout, then track payment and delivery progress from your account.</p><div><span><PackageSearch /> Track order status</span><span><ShieldCheck /> Verified email access</span><span><LockKeyhole /> No card details stored</span></div></div>
    {(mode === 'login' || mode === 'register') && <form className="account-form" onSubmit={submit}><div className="account-tabs"><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button><button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Create account</button></div><h2>{authCopy.title}</h2><p>{authCopy.intro}</p>{mode === 'register' && <><label>Full name<input name="name" autoComplete="name" required minLength={2} /></label><label>Phone number<input name="phone" autoComplete="tel" required pattern="[0-9+ ]{9,15}" placeholder="082 123 4567" /></label></>}<label>Email address<input name="email" type="email" autoComplete="email" required /></label><label>Password<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 10 : 1} /></label>{mode === 'register' && <small>Use at least 10 characters.</small>}{mode === 'login' && <button type="button" className="account-text-action" onClick={() => { setMode('forgot'); setError(''); }}>Forgot password?</button>}{error && <p className="form-error">{error}</p>}<button className="button primary full" disabled={submitting}>{submitting ? 'Please wait…' : <>{mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight /></>}</button><p className="guest-note">{mode === 'register' ? 'We will email you a secure code before activating your account.' : 'Your profile securely connects every checkout to your order history.'}</p></form>}
    {mode === 'verify' && <form className="account-form account-security-form" onSubmit={verifyEmail}><span className="account-security-icon"><MailCheck /></span><h2>{authCopy.title}</h2><p>{authCopy.intro}</p><label>Email address<input type="email" value={pendingEmail} readOnly /></label><label>Six-digit verification code<input className="account-code-input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required autoFocus /></label>{error && <p className="form-error">{error}</p>}<button className="button primary full" disabled={submitting}>{submitting ? 'Checking…' : <>Verify account <ArrowRight /></>}</button><button type="button" className="account-secondary-action" disabled={submitting} onClick={() => void resendVerification()}><RefreshCw /> Send a new code</button><button type="button" className="account-text-action account-back-action" onClick={() => { setMode('login'); setError(''); }}><ArrowLeft /> Back to sign in</button></form>}
    {mode === 'forgot' && <form className="account-form account-security-form" onSubmit={requestPasswordReset}><span className="account-security-icon"><KeyRound /></span><h2>{authCopy.title}</h2><p>{authCopy.intro}</p><label>Email address<input name="email" type="email" autoComplete="email" required autoFocus /></label>{error && <p className="form-error">{error}</p>}<button className="button primary full" disabled={submitting}>{submitting ? 'Sending…' : <>Send reset code <ArrowRight /></>}</button><button type="button" className="account-text-action account-back-action" onClick={() => { setMode('login'); setError(''); }}><ArrowLeft /> Back to sign in</button></form>}
    {mode === 'reset' && <form className="account-form account-security-form" onSubmit={resetPassword}><span className="account-security-icon"><KeyRound /></span><h2>{authCopy.title}</h2><p>{authCopy.intro}</p><label>Email address<input type="email" value={pendingEmail} readOnly /></label><label>Six-digit reset code<input className="account-code-input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required autoFocus /></label><label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label><label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label><small>Use at least 10 characters.</small>{error && <p className="form-error">{error}</p>}<button className="button primary full" disabled={submitting}>{submitting ? 'Updating…' : <>Reset password <ArrowRight /></>}</button><button type="button" className="account-secondary-action" disabled={submitting} onClick={() => { void customerForgotPassword(pendingEmail).then(() => notify('A new reset code was sent.', 'success', 'Code sent')).catch((resendError: unknown) => { const message = resendError instanceof Error ? resendError.message : 'Unable to resend the code'; setError(message); notify(message, 'error'); }); }}><RefreshCw /> Send a new code</button><button type="button" className="account-text-action account-back-action" onClick={() => { setMode('login'); setError(''); }}><ArrowLeft /> Back to sign in</button></form>}
  </section>;
}
