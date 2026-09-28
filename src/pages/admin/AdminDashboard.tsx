import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Bell, Box, Check, ChevronRight, CircleDollarSign, Clock3, FileSearch, LayoutDashboard, LogOut, Menu, PackageCheck, RefreshCw, Search, Settings, ShoppingBag, Users, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useFeedback } from '../../components/FeedbackProvider';
import StatusPill from '../../components/StatusPill';
import ProductManager from '../../components/admin/ProductManager';
import { money, products } from '../../data/products';
import { adminRequest } from '../../lib/api';

type Tab = 'overview' | 'products' | 'review' | 'orders' | 'settings';
type AdminOrder = {
  id?: number; ref: string; customer: string; items: string; total: number; status: string; age: string;
  productRevenue: number; customerDelivery: number; supplierCost: number; supplierDelivery: number; deliveryCost: number; packaging: number; paymentFee: number; advertising: number;
};
type ReviewItem = { id?: number; name: string; reason: string; source: string; value: string; severity: string };
type PricingSettings = { minimumProfit: number; minimumMarginPercent: number; supplierStaleHours: number; freeDeliveryThreshold: number; standardCustomerDelivery: number };

const sampleOrders: AdminOrder[] = [
  { ref: 'MY-2026-A8K4P', customer: 'Lerato Mokoena', items: 'Wahl Home Barber Kit', total: 1099, status: 'checking_supplier', age: '18 min', productRevenue: 1099, customerDelivery: 0, supplierCost: 720, supplierDelivery: 0, deliveryCost: 89, packaging: 18, paymentFee: 33, advertising: 20 },
  { ref: 'MY-2026-H2M9Q', customer: 'Thabo Nkosi', items: 'Pampers Pants × 2', total: 1698, status: 'requested', age: '46 min', productRevenue: 1698, customerDelivery: 0, supplierCost: 1408, supplierDelivery: 0, deliveryCost: 89, packaging: 18, paymentFee: 45, advertising: 20 },
  { ref: 'MY-2026-P7D3W', customer: 'Ayesha Khan', items: 'Wahl Cutek Hairdryer', total: 738, status: 'quoted', age: '2 hrs', productRevenue: 649, customerDelivery: 89, supplierCost: 499, supplierDelivery: 0, deliveryCost: 89, packaging: 18, paymentFee: 25, advertising: 20 },
];
const sampleReviewItems: ReviewItem[] = [
  { name: 'Wahl Cutek Hairdryer', reason: 'Promotion expires tomorrow', source: 'Game', value: 'R499 → R649', severity: 'urgent' },
  { name: 'Pampers Pants Size 6, 96', reason: 'Supplier price changed', source: 'Makro', value: 'R704 → R729', severity: 'warning' },
  { name: 'Russell Hobbs 1.7L Kettle', reason: 'Exact model match uncertain', source: 'CSV import', value: 'Needs review', severity: 'neutral' },
];
const defaultSettings: PricingSettings = { minimumProfit: 120, minimumMarginPercent: 15, supplierStaleHours: 24, freeDeliveryThreshold: 999, standardCustomerDelivery: 89 };

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { confirm, notify } = useFeedback();
  const [tab, setTab] = useState<Tab>('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [orders, setOrders] = useState<AdminOrder[]>(sampleOrders);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>(sampleReviewItems);
  const [catalogProducts, setCatalogProducts] = useState(products);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | undefined>();
  const [settings, setSettings] = useState<PricingSettings>(defaultSettings);
  const [quote, setQuote] = useState({ productRevenue: 1099, customerDelivery: 0, supplierCost: 720, supplierDelivery: 0, deliveryCost: 89, packaging: 18, paymentFee: 33, advertising: 20 });
  const profit = useMemo(() => quote.productRevenue + quote.customerDelivery - quote.supplierCost - quote.supplierDelivery - quote.deliveryCost - quote.packaging - quote.paymentFee - quote.advertising, [quote]);
  const margin = quote.productRevenue ? profit / quote.productRevenue * 100 : 0;
  const selectedOrder = orders.find((order) => order.id === selectedOrderId);
  const searchText = search.trim().toLowerCase();
  const visibleOrders = searchText ? orders.filter((order) => `${order.ref} ${order.customer} ${order.items} ${order.status}`.toLowerCase().includes(searchText)) : orders;
  const visibleReviews = searchText ? reviewItems.filter((item) => `${item.name} ${item.reason} ${item.source}`.toLowerCase().includes(searchText)) : reviewItems;

  const loadDashboard = useCallback(async (showSuccess = false) => {
    if (sessionStorage.getItem('moya-admin-token') === 'local-development-preview') {
      if (showSuccess) notify('Preview data refreshed.', 'success');
      return;
    }
    setRefreshing(true);
    try {
      const [orderRows, reviewRows, productRows, pricing] = await Promise.all([
        adminRequest<Record<string, unknown>[]>('/orders'), adminRequest<Record<string, unknown>[]>('/review-queue'),
        adminRequest<Record<string, unknown>[]>('/products'), adminRequest<Record<string, unknown> | null>('/pricing-settings'),
      ]);
      const mappedOrders = orderRows.map((row): AdminOrder => ({
        id: Number(row.id), ref: String(row.reference), customer: String(row.customer_name), items: 'Open for details', total: Number(row.product_revenue) + Number(row.customer_delivery_charged), status: String(row.status), age: new Date(String(row.created_at)).toLocaleDateString('en-ZA'),
        productRevenue: Number(row.product_revenue || 0), customerDelivery: Number(row.customer_delivery_charged || 0), supplierCost: Number(row.supplier_product_cost || 0), supplierDelivery: Number(row.supplier_delivery || 0), deliveryCost: Number(row.customer_delivery_cost || 0), packaging: Number(row.packaging_cost || 0), paymentFee: Number(row.payment_fee_estimate || 0), advertising: Number(row.advertising_cost || 0),
      }));
      setOrders(mappedOrders);
      setSelectedOrderId((current) => mappedOrders.some((order) => order.id === current) ? current : mappedOrders[0]?.id);
      setReviewItems(reviewRows.map((row): ReviewItem => ({ id: Number(row.id), name: String(row.title), reason: String(row.review_reason || 'Needs review'), source: String(row.retailer || 'No offer'), value: row.current_cost ? money(Number(row.current_cost)) : 'Needs review', severity: String(row.review_reason).includes('expired') ? 'urgent' : 'warning' })));
      setCatalogProducts(productRows.map((row) => ({ id: Number(row.id), slug: String(row.slug), name: String(row.title), brand: String(row.brand), model: String(row.model), packSize: String(row.pack_size), category: String(row.category), price: Number(row.selling_price), image: '', accent: '#e6eee9', short: '', description: String(row.description), specs: row.specifications as Record<string,string>, status: String(row.status) as 'published' | 'pending_review' | 'paused', freshness: String(row.last_checked_at || '') })));
      if (pricing) setSettings({ minimumProfit: Number(pricing.minimum_profit), minimumMarginPercent: Number(pricing.minimum_margin_percent), supplierStaleHours: Number(pricing.supplier_stale_hours), freeDeliveryThreshold: Number(pricing.free_delivery_threshold), standardCustomerDelivery: Number(pricing.standard_customer_delivery) });
      setNotice('');
      if (showSuccess) notify('Orders, products and the review queue are up to date.', 'success', 'Dashboard refreshed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Live data could not be loaded.';
      setNotice('Live data could not be loaded. Showing the most recent available data.'); notify(message, 'error');
    } finally { setRefreshing(false); }
  }, [notify]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  if (!sessionStorage.getItem('moya-admin-token')) return <Navigate to="/admin/login" replace />;

  const logout = async () => {
    if (!await confirm({ title: 'Sign out of admin?', message: 'Any unsaved form changes will be lost.', confirmLabel: 'Sign out' })) return;
    sessionStorage.removeItem('moya-admin-token'); notify('You have been signed out.', 'success'); navigate('/admin/login');
  };
  const openOrder = (order: AdminOrder) => {
    setSelectedOrderId(order.id);
    setQuote({ productRevenue: order.productRevenue, customerDelivery: order.customerDelivery, supplierCost: order.supplierCost, supplierDelivery: order.supplierDelivery, deliveryCost: order.deliveryCost, packaging: order.packaging, paymentFee: order.paymentFee, advertising: order.advertising });
    setTab('orders');
    notify(order.id ? `${order.ref} is selected for quoting.` : 'Preview orders cannot be changed. Live orders will be selectable in production.', 'info', 'Order opened');
  };
  const openReview = (item: ReviewItem) => { setTab('products'); notify(`Open “${item.name}” with Edit to complete its review.`, 'info', 'Review product'); };
  const confirmQuote = async () => {
    if (!selectedOrder?.id) return notify('Select a live order before confirming a quote.', 'warning');
    if (!await confirm({ title: 'Confirm this quote?', message: `Save a quote for ${selectedOrder.ref} with estimated profit of ${money(profit)} and ${margin.toFixed(1)}% margin?`, confirmLabel: 'Confirm quote' })) return;
    setSavingQuote(true);
    try {
      await adminRequest(`/orders/${selectedOrder.id}/quote`, { method: 'PATCH', body: JSON.stringify({ customerDeliveryCharged: quote.customerDelivery, supplierProductCost: quote.supplierCost, supplierDelivery: quote.supplierDelivery, customerDeliveryCost: quote.deliveryCost, packagingCost: quote.packaging, paymentFeeEstimate: quote.paymentFee, advertisingCost: quote.advertising }) });
      notify(`Quote for ${selectedOrder.ref} was saved.`, 'success', 'Quote confirmed'); await loadDashboard();
    } catch (error) { notify(error instanceof Error ? error.message : 'The quote could not be saved.', 'error'); }
    finally { setSavingQuote(false); }
  };
  const saveSettings = async () => {
    if (!await confirm({ title: 'Save pricing settings?', message: 'These guardrails will be used for product publishing, quoting and supplier freshness checks.', confirmLabel: 'Save settings' })) return;
    setSavingSettings(true);
    try { await adminRequest('/pricing-settings', { method: 'PATCH', body: JSON.stringify(settings) }); notify('Pricing and delivery guardrails were updated.', 'success', 'Settings saved'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Pricing settings could not be saved.', 'error'); }
    finally { setSavingSettings(false); }
  };
  const setting = (key: keyof PricingSettings, value: number) => setSettings((current) => ({ ...current, [key]: value }));
  const nav = (value: Tab, icon: React.ReactNode, label: string, count?: number) => <button type="button" className={tab === value ? 'active' : ''} onClick={() => { setTab(value); setMobileNav(false); }}>{icon}<span>{label}</span>{count ? <b>{count}</b> : null}</button>;

  return <div className="admin-shell">
    <aside className={mobileNav ? 'admin-sidebar open' : 'admin-sidebar'}><div className="admin-logo"><Link className="brand light" to="/"><span className="brand-mark">m</span><span>moya</span><small>ops</small></Link><button type="button" aria-label="Close menu" onClick={() => setMobileNav(false)}><X /></button></div><nav><small>Workspace</small>{nav('overview', <LayoutDashboard />, 'Overview')}{nav('products', <Box />, 'Products')}{nav('review', <FileSearch />, 'Review queue', reviewItems.length)}{nav('orders', <ShoppingBag />, 'Orders', orders.length)}<small>Manage</small>{nav('settings', <Settings />, 'Pricing settings')}</nav><div className="admin-user"><span>CM</span><div><strong>Chris M.</strong><small>Administrator</small></div><button type="button" onClick={() => void logout()} title="Sign out" aria-label="Sign out"><LogOut /></button></div></aside>
    <main className="admin-main"><header className="admin-topbar"><button type="button" className="admin-menu" aria-label="Open menu" onClick={() => setMobileNav(true)}><Menu /></button><div><h1>{tab === 'overview' ? 'Good morning, Chris.' : tab === 'review' ? 'Review queue' : tab[0].toUpperCase() + tab.slice(1)}</h1><p>{tab === 'overview' ? "Here's what needs your attention today." : 'Moya Market operations workspace'}</p></div><div className="admin-actions"><label><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search orders or reviews" /></label><button type="button" className="bell" aria-label="Open review notifications" title="Open review notifications" onClick={() => { setTab('review'); notify(`${reviewItems.length} product${reviewItems.length === 1 ? '' : 's'} need review.`, 'info', 'Review queue'); }}><Bell /><i /></button><a className="view-store" href="/" target="_blank" rel="noreferrer">View store <ArrowUpRight /></a></div></header>
      {tab === 'overview' && <div className="admin-content">{notice && <p className="admin-notice">{notice}</p>}
        <section className="attention-banner"><AlertTriangle /><div><strong>{reviewItems.length} items need attention</strong><span>Review supplier prices, promotion dates and exact product matches before publishing.</span></div><button type="button" onClick={() => setTab('review')}>Open review queue <ChevronRight /></button></section>
        <section className="metric-grid"><div><span><ShoppingBag /></span><p>Orders to action</p><strong>{orders.length}</strong><small><ArrowUpRight /> Current queue</small></div><div><span><FileSearch /></span><p>Pending review</p><strong>{reviewItems.length}</strong><small className="warn">Human check required</small></div><div><span><CircleDollarSign /></span><p>Order revenue</p><strong>{money(orders.reduce((sum, order) => sum + order.total, 0))}</strong><small><ArrowUpRight /> Current requests</small></div><div><span><PackageCheck /></span><p>Catalogue products</p><strong>{catalogProducts.length}</strong><small className="muted"><ArrowDownRight /> Across all states</small></div></section>
        <div className="admin-columns"><section className="admin-card"><div className="card-heading"><div><p className="kicker">Live workflow</p><h2>Orders needing action</h2></div><button type="button" onClick={() => setTab('orders')}>View all <ChevronRight /></button></div><div className="order-list">{visibleOrders.map((order) => <div key={order.ref}><span className="order-avatar">{order.customer.split(' ').map((part) => part[0]).join('')}</span><div className="order-person"><strong>{order.customer}</strong><span>{order.ref} · {order.items}</span></div><StatusPill status={order.status} /><div className="order-value"><strong>{money(order.total)}</strong><span>{order.age} ago</span></div><button type="button" aria-label={`Open ${order.ref}`} onClick={() => openOrder(order)}><ChevronRight /></button></div>)}</div></section>
          <section className="admin-card review-card"><div className="card-heading"><div><p className="kicker">Risk watch</p><h2>Review next</h2></div><button type="button" onClick={() => setTab('review')}>View queue <ChevronRight /></button></div>{visibleReviews.map((item) => <article key={item.name}><i className={item.severity}><AlertTriangle /></i><div><strong>{item.name}</strong><span>{item.reason}</span><small>{item.source} · {item.value}</small></div><button type="button" aria-label={`Review ${item.name}`} onClick={() => openReview(item)}><ChevronRight /></button></article>)}</section></div>
        <section className="admin-card activity-card"><div className="card-heading"><div><p className="kicker">Today</p><h2>Operations pulse</h2></div><button type="button" className="outline-button" disabled={refreshing} onClick={() => void loadDashboard(true)}><RefreshCw /> {refreshing ? 'Refreshing…' : 'Refresh data'}</button></div><div className="pulse-grid"><div><BarChart3 /><strong>73%</strong><span>Average gross margin health</span><i><b style={{ width: '73%' }} /></i></div><div><RefreshCw /><strong>{catalogProducts.length}</strong><span>Catalogue offers tracked</span><i><b style={{ width: '81%' }} /></i></div><div><Clock3 /><strong>1h 14m</strong><span>Average quote turnaround</span><i><b style={{ width: '64%' }} /></i></div><div><Users /><strong>94%</strong><span>Orders updated on time</span><i><b style={{ width: '94%' }} /></i></div></div></section>
      </div>}
      {tab === 'products' && <div className="admin-content"><ProductManager onChanged={() => void loadDashboard()} /></div>}
      {tab === 'review' && <div className="admin-content"><section className="admin-card review-table"><div className="card-heading"><div><p className="kicker">Human verification required</p><h2>{visibleReviews.length} items waiting</h2></div><button type="button" className="outline-button" disabled={refreshing} onClick={() => void loadDashboard(true)}><RefreshCw /> {refreshing ? 'Refreshing…' : 'Refresh queue'}</button></div>{visibleReviews.map((item) => <article key={item.name}><i className={item.severity}><AlertTriangle /></i><div><strong>{item.name}</strong><span>{item.reason}</span></div><div><small>Source</small><b>{item.source}</b></div><div><small>Change</small><b>{item.value}</b></div><button type="button" className="outline-button" onClick={() => openReview(item)}>Review <ChevronRight /></button></article>)}</section></div>}
      {tab === 'orders' && <div className="admin-content"><div className="admin-columns orders-view"><section className="admin-card"><div className="card-heading"><div><p className="kicker">Order queue</p><h2>Requests</h2></div></div><div className="order-list">{visibleOrders.map((order) => <div className={order.id && order.id === selectedOrderId ? 'selected' : ''} key={order.ref}><span className="order-avatar">{order.customer.slice(0, 2).toUpperCase()}</span><div className="order-person"><strong>{order.customer}</strong><span>{order.ref} · {order.items}</span></div><StatusPill status={order.status} /><div className="order-value"><strong>{money(order.total)}</strong><span>{order.age} ago</span></div><button type="button" className="outline-button" onClick={() => openOrder(order)}>Select</button></div>)}</div></section><section className="admin-card quote-card"><div className="card-heading"><div><p className="kicker">Quote calculator</p><h2>{selectedOrder ? selectedOrder.ref : 'Select an order'}</h2></div></div><div className="quote-fields">{Object.entries(quote).map(([key, value]) => <label key={key}><span>{key.replace(/([A-Z])/g, ' $1')}</span><div>R <input type="number" min="0" step="0.01" value={value} onChange={(event) => setQuote({ ...quote, [key]: Number(event.target.value) })} /></div></label>)}</div><div className={profit > 0 && margin >= 10 ? 'profit-box healthy' : 'profit-box danger'}><span>Expected profit</span><strong>{money(profit)}</strong><small>{margin.toFixed(1)}% margin</small></div><button type="button" className="solid-button full" disabled={savingQuote} onClick={() => void confirmQuote()}><Check /> {savingQuote ? 'Saving quote…' : 'Confirm quote'}</button><p className="quote-warning">Payment links are added separately after quote confirmation. Paid status still requires payment verification.</p></section></div></div>}
      {tab === 'settings' && <div className="admin-content"><section className="admin-card settings-card"><div className="card-heading"><div><p className="kicker">Guardrails</p><h2>Pricing settings</h2></div></div><div className="settings-grid"><label>Minimum expected profit<div>R <input type="number" min="0" value={settings.minimumProfit} onChange={(event) => setting('minimumProfit', Number(event.target.value))} /></div><small>Products below this value go to review.</small></label><label>Minimum margin<div><input type="number" min="0" max="100" value={settings.minimumMarginPercent} onChange={(event) => setting('minimumMarginPercent', Number(event.target.value))} /> %</div><small>Calculated after all attributable costs.</small></label><label>Supplier data stale after<div><input type="number" min="1" max="168" value={settings.supplierStaleHours} onChange={(event) => setting('supplierStaleHours', Number(event.target.value))} /> hours</div><small>Listings are paused when data becomes stale.</small></label><label>Free customer delivery from<div>R <input type="number" min="0" value={settings.freeDeliveryThreshold} onChange={(event) => setting('freeDeliveryThreshold', Number(event.target.value))} /></div><small>The threshold applies to the complete cart.</small></label><label>Standard customer delivery<div>R <input type="number" min="0" value={settings.standardCustomerDelivery} onChange={(event) => setting('standardCustomerDelivery', Number(event.target.value))} /></div><small>Used below the free-delivery threshold.</small></label></div><button type="button" className="solid-button" disabled={savingSettings} onClick={() => void saveSettings()}>{savingSettings ? 'Saving…' : 'Save settings'}</button></section></div>}
    </main>
  </div>;
}
