import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminLogin } from '../../lib/api';
import { ADMIN_TOKEN_KEY } from '../../lib/storage';
import { useFeedback } from '../../components/FeedbackProvider';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { notify } = useFeedback();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setSubmitting(true);
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') || '');
    const password = String(data.get('password') || '');
    if (!email || !password) { setSubmitting(false); return setError('Enter your email and password.'); }
    try {
      const { token } = await adminLogin(email, password);
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      notify('Welcome back. The operations dashboard is ready.', 'success', 'Signed in');
      navigate('/admin');
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : 'Unable to sign in'; setError(message); notify(message, 'error');
      setSubmitting(false);
    }
  };
  return <main className="admin-login"><section className="login-brand"><Link className="brand light" to="/" aria-label="Mzansi Mega Ops home"><span className="brand-mark" aria-hidden="true">M</span><span>zansi</span><small>Mega Ops</small></Link><div><p className="kicker">Operations, without the noise</p><h1>Check carefully.<br /><em>Sell confidently.</em></h1><p>Review supplier offers, protect your margin and keep every customer order moving.</p></div><span><ShieldCheck /> Admin access is protected and audited</span></section><section className="login-panel"><form onSubmit={submit}><div className="login-icon"><LockKeyhole /></div><p className="kicker">Team access</p><h2>Welcome back</h2><p>Sign in to your operations dashboard.</p><label>Email address<input type="email" name="email" autoComplete="username" required /></label><label>Password<input type="password" name="password" autoComplete="current-password" required /></label>{error && <p className="form-error">{error}</p>}<button className="button primary full" disabled={submitting}>{submitting ? 'Signing in…' : <>Sign in <ArrowRight size={18} /></>}</button><small>Use the administrator account stored in the production database.</small></form></section></main>;
}
