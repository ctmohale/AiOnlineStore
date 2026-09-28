import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Bell, Box, Check, ChevronRight, CircleDollarSign, Clock3, FileSearch, LayoutDashboard, LogOut, Menu, PackageCheck, RefreshCw, Search, Settings, ShoppingBag, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import StatusPill from '../../components/StatusPill';
import ProductManager from '../../components/admin/ProductManager';
import { money, products } from '../../data/products';
import { adminRequest } from '../../lib/api';

const sampleOrders = [
  { ref: 'MY-2026-A8K4P', customer: 'Lerato Mokoena', items: 'Wahl Home Barber Kit', total: 1099, status: 'checking_supplier', age: '18 min' },
  { ref: 'MY-2026-H2M9Q', customer: 'Thabo Nkosi', items: 'Pampers Pants × 2', total: 1698, status: 'requested', age: '46 min' },
  { ref: 'MY-2026-P7D3W', customer: 'Ayesha Khan', items: 'Wahl Cutek Hairdryer', total: 738, status: 'quoted', age: '2 hrs' },
];
const sampleReviewItems = [
  { name: 'Wahl Cutek Hairdryer', reason: 'Promotion expires tomorrow', source: 'Game', value: 'R499 → R649', severity: 'urgent' },
  { name: 'Pampers Pants Size 6, 96', reason: 'Supplier price changed', source: 'Makro', value: 'R704 → R729', severity: 'warning' },
  { name: 'Russell Hobbs 1.7L Kettle', reason: 'Exact model match uncertain', source: 'CSV import', value: 'Needs review', severity: 'neutral' },
];

type Tab = 'overview' | 'products' | 'review' | 'orders' | 'settings';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [orders, setOrders] = useState<(typeof sampleOrders[number] & { id?: number })[]>(sampleOrders);
  const [reviewItems, setReviewItems] = useState(sampleReviewItems);
  const [catalogProducts, setCatalogProducts] = useState(products);
  const [notice, setNotice] = useState('');
  const [quote, setQuote] = useState({ productRevenue: 1099, customerDelivery: 0, supplierCost: 720, supplierDelivery: 0, deliveryCost: 89, packaging: 18, paymentFee: 33, advertising: 20 });
  const profit = useMemo(() => quote.productRevenue + quote.customerDelivery - quote.supplierCost - quote.supplierDelivery - quote.deliveryCost - quote.packaging - quote.paymentFee - quote.advertising, [quote]);
  const margin = quote.productRevenue ? profit / quote.productRevenue * 100 : 0;
  useEffect(() => {
    if (sessionStorage.getItem('moya-admin-token') === 'local-development-preview') return;
    Promise.all([
      adminRequest<Record<string, unknown>[]>('/orders'),
      adminRequest<Record<string, unknown>[]>('/review-queue'),
      adminRequest<Record<string, unknown>[]>('/products'),
    ]).then(([orderRows, reviewRows, productRows]) => {
      setOrders(orderRows.map((row) => ({ id: Number(row.id), ref: String(row.reference), customer: String(row.customer_name), items: 'Open for details', total: Number(row.product_revenue) + Number(row.customer_delivery_charged), status: String(row.status), age: new Date(String(row.created_at)).toLocaleDateString('en-ZA') })) as (typeof sampleOrders[number] & { id?: number })[]);
      setReviewItems(reviewRows.map((row) => ({ name: String(row.title), reason: String(row.review_reason || 'Needs review'), source: String(row.retailer || 'No offer'), value: row.current_cost ? money(Number(row.current_cost)) : 'Needs review', severity: String(row.review_reason).includes('expired') ? 'urgent' : 'warning' })) as typeof sampleReviewItems);
      setCatalogProducts(productRows.map((row) => ({ id: Number(row.id), slug: String(row.slug), name: String(row.title), brand: String(row.brand), model: String(row.model), packSize: String(row.pack_size), category: String(row.category), price: Number(row.selling_price), image: '', accent: '#e6eee9', short: '', description: String(row.description), specs: row.specifications as Record<string,string>, status: String(row.status) as 'published' | 'pending_review' | 'paused', freshness: String(row.last_checked_at || '') })));
    }).catch(() => setNotice('Live data could not be loaded. Showing preview data.'));
  }, []);
  if (!sessionStorage.getItem('moya-admin-token')) return <Navigate to="/admin/login" replace />;
  const logout = () => { sessionStorage.removeItem('moya-admin-token'); navigate('/admin/login'); };
  const nav = (value: Tab, icon: React.ReactNode, label: string, count?: number) => <button className={tab === value ? 'active' : ''} onClick={() => { setTab(value); setMobileNav(false); }}>{icon}<span>{label}</span>{count ? <b>{count}</b> : null}</button>;
  return <div className="admin-shell">
    <aside className={mobileNav ? 'admin-sidebar open' : 'admin-sidebar'}><div className="admin-logo"><Link className="brand light" to="/"><span className="brand-mark">m</span><span>moya</span><small>ops</small></Link><button onClick={() => setMobileNav(false)}><X /></button></div><nav><small>Workspace</small>{nav('overview', <LayoutDashboard />, 'Overview')}{nav('products', <Box />, 'Products')}{nav('review', <FileSearch />, 'Review queue', 3)}{nav('orders', <ShoppingBag />, 'Orders', 3)}<small>Manage</small>{nav('settings', <Settings />, 'Pricing settings')}</nav><div className="admin-user"><span>CM</span><div><strong>Chris M.</strong><small>Administrator</small></div><button onClick={logout} title="Sign out"><LogOut /></button></div></aside>
    <main className="admin-main"><header className="admin-topbar"><button className="admin-menu" onClick={() => setMobileNav(true)}><Menu /></button><div><h1>{tab === 'overview' ? 'Good morning, Chris.' : tab === 'review' ? 'Review queue' : tab[0].toUpperCase() + tab.slice(1)}</h1><p>{tab === 'overview' ? "Here's what needs your attention today." : 'Moya Market operations workspace'}</p></div><div className="admin-actions"><label><Search /><input placeholder="Search anything" /></label><button className="bell"><Bell /><i /></button><a className="view-store" href="/" target="_blank">View store <ArrowUpRight /></a></div></header>
      {tab === 'overview' && <div className="admin-content">{notice && <p className="admin-notice">{notice}</p>}
        <section className="attention-banner"><AlertTriangle /><div><strong>3 items need attention</strong><span>Two supplier offers expire within 24 hours and one product match is uncertain.</span></div><button onClick={() => setTab('review')}>Open review queue <ChevronRight /></button></section>
        <section className="metric-grid"><div><span><ShoppingBag /></span><p>Orders to action</p><strong>{orders.length}</strong><small><ArrowUpRight /> Current queue</small></div><div><span><FileSearch /></span><p>Pending review</p><strong>{reviewItems.length}</strong><small className="warn">Human check required</small></div><div><span><CircleDollarSign /></span><p>Expected profit</p><strong>{money(orders.reduce((sum, order) => sum + order.total, 0))}</strong><small><ArrowUpRight /> Order revenue</small></div><div><span><PackageCheck /></span><p>Catalogue products</p><strong>{catalogProducts.length}</strong><small className="muted"><ArrowDownRight /> Across all states</small></div></section>
        <div className="admin-columns"><section className="admin-card"><div className="card-heading"><div><p className="kicker">Live workflow</p><h2>Orders needing action</h2></div><button onClick={() => setTab('orders')}>View all <ChevronRight /></button></div><div className="order-list">{orders.map((order) => <div key={order.ref}><span className="order-avatar">{order.customer.split(' ').map((part) => part[0]).join('')}</span><div className="order-person"><strong>{order.customer}</strong><span>{order.ref} · {order.items}</span></div><StatusPill status={order.status} /><div className="order-value"><strong>{money(order.total)}</strong><span>{order.age} ago</span></div><button><ChevronRight /></button></div>)}</div></section>
          <section className="admin-card review-card"><div className="card-heading"><div><p className="kicker">Risk watch</p><h2>Review next</h2></div><button onClick={() => setTab('review')}>View queue <ChevronRight /></button></div>{reviewItems.map((item) => <article key={item.name}><i className={item.severity}><AlertTriangle /></i><div><strong>{item.name}</strong><span>{item.reason}</span><small>{item.source} · {item.value}</small></div><button><ChevronRight /></button></article>)}</section></div>
        <section className="admin-card activity-card"><div className="card-heading"><div><p className="kicker">Today</p><h2>Operations pulse</h2></div><span>Last refreshed just now</span></div><div className="pulse-grid"><div><BarChart3 /><strong>73%</strong><span>Average gross margin health</span><i><b style={{ width: '73%' }} /></i></div><div><RefreshCw /><strong>21 / 26</strong><span>Offers checked in past 24h</span><i><b style={{ width: '81%' }} /></i></div><div><Clock3 /><strong>1h 14m</strong><span>Average quote turnaround</span><i><b style={{ width: '64%' }} /></i></div><div><Users /><strong>94%</strong><span>Orders updated on time</span><i><b style={{ width: '94%' }} /></i></div></div></section>
      </div>}
      {tab === 'products' && <div className="admin-content"><ProductManager /></div>}
      {tab === 'review' && <div className="admin-content"><section className="admin-card review-table"><div className="card-heading"><div><p className="kicker">Human verification required</p><h2>3 items waiting</h2></div><button className="outline-button"><RefreshCw /> Run recheck</button></div>{reviewItems.map((item) => <article key={item.name}><i className={item.severity}><AlertTriangle /></i><div><strong>{item.name}</strong><span>{item.reason}</span></div><div><small>Source</small><b>{item.source}</b></div><div><small>Change</small><b>{item.value}</b></div><button className="outline-button">Review <ChevronRight /></button></article>)}</section></div>}
      {tab === 'orders' && <div className="admin-content"><div className="admin-columns orders-view"><section className="admin-card"><div className="card-heading"><div><p className="kicker">Order queue</p><h2>Requests</h2></div></div><div className="order-list">{orders.map((order) => <div key={order.ref}><span className="order-avatar">{order.customer.slice(0, 2).toUpperCase()}</span><div className="order-person"><strong>{order.customer}</strong><span>{order.ref} · {order.items}</span></div><StatusPill status={order.status} /><div className="order-value"><strong>{money(order.total)}</strong><span>{order.age} ago</span></div></div>)}</div></section><section className="admin-card quote-card"><div className="card-heading"><div><p className="kicker">Quote calculator</p><h2>Expected profit</h2></div></div><div className="quote-fields">{Object.entries(quote).map(([key, value]) => <label key={key}><span>{key.replace(/([A-Z])/g, ' $1')}</span><div>R <input type="number" value={value} onChange={(event) => setQuote({ ...quote, [key]: Number(event.target.value) })} /></div></label>)}</div><div className={profit > 0 && margin >= 10 ? 'profit-box healthy' : 'profit-box danger'}><span>Expected profit</span><strong>{money(profit)}</strong><small>{margin.toFixed(1)}% margin</small></div><button className="solid-button full"><Check /> Confirm quote</button><p className="quote-warning">Payment link is added manually after quote confirmation. An order is marked paid only after verification.</p></section></div></div>}
      {tab === 'settings' && <div className="admin-content"><section className="admin-card settings-card"><div className="card-heading"><div><p className="kicker">Guardrails</p><h2>Pricing settings</h2></div></div><div className="settings-grid"><label>Minimum expected profit<div>R <input type="number" defaultValue="120" /></div><small>Products below this value go to review.</small></label><label>Minimum margin<div><input type="number" defaultValue="15" /> %</div><small>Calculated after all attributable costs.</small></label><label>Supplier data stale after<div><input type="number" defaultValue="24" /> hours</div><small>Listings are paused when data becomes stale.</small></label><label>Free customer delivery from<div>R <input type="number" defaultValue="999" /></div><small>Delivery cost remains part of profit.</small></label></div><button className="solid-button">Save settings</button></section></div>}
    </main>
  </div>;
}
