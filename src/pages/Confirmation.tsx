import { ArrowRight, Check, Clock3, Mail, SearchCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

export default function Confirmation() {
  const { reference } = useParams();
  return <section className="confirmation-page"><div className="confirmation-card"><span className="success-icon"><Check /></span><p className="kicker">Request received</p><h1>Thanks—<em>we're on it.</em></h1><p>Your order request has been received. You have not been charged.</p><div className="reference"><span>Your reference</span><strong>{reference}</strong></div><div className="next-steps"><h2>What happens next?</h2><div><SearchCheck /><p><strong>We verify your items</strong><span>We'll check the exact products, current supplier prices and stock.</span></p></div><div><Mail /><p><strong>We send your final quote</strong><span>You'll receive an email or WhatsApp with the confirmed total and secure payment link.</span></p></div><div><Clock3 /><p><strong>Usually within one business day</strong><span>Promotional stock moves quickly, so we'll be in touch as soon as possible.</span></p></div></div><Link className="button primary" to="/shop">Continue shopping <ArrowRight size={18} /></Link></div></section>;
}
