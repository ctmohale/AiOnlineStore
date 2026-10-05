import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Bell, Box, Check, ChevronRight, CircleDollarSign, Clock3, Eye, EyeOff, FileSearch, LayoutDashboard, LogOut, Menu, PackageCheck, RefreshCw, Search, Settings, Share2, ShoppingBag, Users, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useFeedback } from '../../components/FeedbackProvider';
import StatusPill from '../../components/StatusPill';
import ProductManager from '../../components/admin/ProductManager';
import OrderWorkflow from '../../components/admin/OrderWorkflow';
import CustomerManager from '../../components/admin/CustomerManager';
import AdminAnalytics, { type AnalyticsData } from '../../components/admin/AdminAnalytics';
import { money, type Product } from '../../data/products';
import { adminRequest } from '../../lib/api';
import CatalogueShareManager from '../../components/admin/CatalogueShareManager';
import { ADMIN_TOKEN_KEY, getAdminToken } from '../../lib/storage';

type Tab = 'overview' | 'products' | 'marketing' | 'review' | 'orders' | 'customers' | 'settings';
type AdminOrder = {
  id?: number; ref: string; customer: string; email: string; phone: string; address: string; courierName: string; trackingNumber: string; trackingUrl: string; items: string; total: number; status: string; age: string; isTest: boolean;
  productRevenue: number; customerDelivery: number; supplierCost: number; supplierDelivery: number; deliveryCost: number; packaging: number; paymentFee: number; advertising: number;
  supplierOrderReference: string; supplierOrderUrl: string; fulfilmentNotes: string; expectedShipAt: string; expectedDeliveryAt: string; deliveryEstimateMinDays: number | null; deliveryEstimateMaxDays: number | null; deliveryEstimateBasis: string; actualSupplierCost: number | null; actualSupplierDelivery: number | null; actualDeliveryCost: number | null; actualPackaging: number | null; actualPaymentFee: number | null; actualAdvertising: number | null; actualProfit: number | null;
};
type ReviewItem = { id?: number; name: string; reason: string; source: string; value: string; severity: string };
type PricingSettings = { minimumProfit: number; minimumMarginPercent: number; standardMarkupPercent: number; supplierStaleHours: number; freeDeliveryThreshold: number; standardCustomerDelivery: number };
type AdminProfile = { id: number; email: string; name: string; role: string };
type EmailDelivery = { summary: Record<'pending' | 'processing' | 'sent' | 'failed', number>; messages: { id:number; message_type:string; recipient_email:string; recipient_name:string | null; subject:string; status:string; attempts:number; sent_at:string | null; last_error:string | null; created_at:string }[] };

function AdminPasswordInput({ name, label, autoComplete }: { name: string; label: string; autoComplete: 'current-password' | 'new-password' }) {
  const [visible, setVisible] = useState(false);
  return <div className="admin-password-input"><input name={name} aria-label={label} type={visible ? 'text' : 'password'} required minLength={autoComplete === 'new-password' ? 12 : undefined} maxLength={128} autoComplete={autoComplete} /><button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={visible}>{visible ? <EyeOff /> : <Eye />}</button></div>;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { confirm, notify } = useFeedback();
  const [tab, setTab] = useState<Tab>('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [notice, setNotice] = useState('');
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | undefined>();
  const [reviewProductId, setReviewProductId] = useState<number | undefined>();
  const [settings, setSettings] = useState<PricingSettings | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [emailDelivery, setEmailDelivery] = useState<EmailDelivery | null>(null);
  const [quote, setQuote] = useState({ productRevenue: 0, customerDelivery: 0, supplierCost: 0, supplierDelivery: 0, deliveryCost: 0, packaging: 0, paymentFee: 0, advertising: 0 });
  const profit = useMemo(() => quote.productRevenue + quote.customerDelivery - quote.supplierCost - quote.supplierDelivery - quote.deliveryCost - quote.packaging - quote.paymentFee - quote.advertising, [quote]);
  const margin = quote.productRevenue ? profit / quote.productRevenue * 100 : 0;
  const selectedOrder = orders.find((order) => order.id === selectedOrderId);
  const searchText = search.trim().toLowerCase();
  const realOrders = orders.filter((order) => !order.isTest);
  const visibleOrders = searchText ? realOrders.filter((order) => `${order.ref} ${order.customer} ${order.items} ${order.status}`.toLowerCase().includes(searchText)) : realOrders;
  const actionableOrders = realOrders.filter((order) => !['delivered', 'cancelled', 'refunded'].includes(order.status));
  const visibleActionableOrders = visibleOrders.filter((order) => !['delivered', 'cancelled', 'refunded'].includes(order.status));
  const visibleReviews = searchText ? reviewItems.filter((item) => `${item.name} ${item.reason} ${item.source}`.toLowerCase().includes(searchText)) : reviewItems;
  const urgentReviews = reviewItems.filter((item) => item.severity === 'urgent').length;
  const pricingReviews = reviewItems.filter((item) => /price|cost|margin|profit/i.test(item.reason)).length;
  const supplierReviews = reviewItems.filter((item) => /supplier|source|stock|promotion/i.test(item.reason)).length;
  const publishedProducts = catalogProducts.filter((product) => product.status === 'published').length;
  const quotedOrders = realOrders.filter((order) => order.status === 'quoted' || order.status === 'awaiting_payment').length;
  const completedOrders = realOrders.filter((order) => order.status === 'delivered').length;

  const loadDashboard = useCallback(async (showSuccess = false) => {
    setRefreshing(true);
    try {
      const [orderRows, reviewRows, productRows, pricing, adminProfile, analyticsData, emailData] = await Promise.all([
        adminRequest<Record<string, unknown>[]>('/orders'), adminRequest<Record<string, unknown>[]>('/review-queue'),
        adminRequest<Record<string, unknown>[]>('/products'), adminRequest<Record<string, unknown> | null>('/pricing-settings'),
        adminRequest<AdminProfile>('/me'), adminRequest<AnalyticsData>('/analytics'), adminRequest<EmailDelivery>('/emails').catch(() => ({ summary: { pending:0, processing:0, sent:0, failed:0 }, messages: [] })),
      ]);
      const mappedOrders = orderRows.map((row): AdminOrder => ({
        id: Number(row.id), ref: String(row.reference), customer: String(row.customer_name), email: String(row.customer_email || ''), phone: String(row.customer_phone || ''), address: [row.address_line_1, row.suburb, row.city, row.province, row.postal_code].filter(Boolean).join(', '), courierName: String(row.courier_name || ''), trackingNumber: String(row.tracking_number || ''), trackingUrl: String(row.tracking_url || ''), items: String(row.item_summary || 'No items'), total: Number(row.product_revenue) + Number(row.customer_delivery_charged), status: String(row.status), isTest: Boolean(row.is_test), age: new Intl.RelativeTimeFormat('en-ZA', { numeric: 'auto' }).format(-Math.max(0, Math.floor((Date.now() - new Date(String(row.created_at)).getTime()) / 86_400_000)), 'day'),
        productRevenue: Number(row.product_revenue || 0), customerDelivery: Number(row.customer_delivery_charged || 0), supplierCost: Number(row.supplier_product_cost || 0), supplierDelivery: Number(row.supplier_delivery || 0), deliveryCost: Number(row.customer_delivery_cost || 0), packaging: Number(row.packaging_cost || 0), paymentFee: Number(row.payment_fee_estimate || 0), advertising: Number(row.advertising_cost || 0),
        supplierOrderReference: String(row.supplier_order_reference || ''), supplierOrderUrl: String(row.supplier_order_url || ''), fulfilmentNotes: String(row.fulfilment_notes || ''), expectedShipAt: row.expected_ship_at ? String(row.expected_ship_at) : '', expectedDeliveryAt: row.expected_delivery_at ? String(row.expected_delivery_at) : '', deliveryEstimateMinDays: row.delivery_estimate_min_days == null ? null : Number(row.delivery_estimate_min_days), deliveryEstimateMaxDays: row.delivery_estimate_max_days == null ? null : Number(row.delivery_estimate_max_days), deliveryEstimateBasis: String(row.delivery_estimate_basis || ''), actualSupplierCost: row.actual_supplier_product_cost == null ? null : Number(row.actual_supplier_product_cost), actualSupplierDelivery: row.actual_supplier_delivery == null ? null : Number(row.actual_supplier_delivery), actualDeliveryCost: row.actual_customer_delivery_cost == null ? null : Number(row.actual_customer_delivery_cost), actualPackaging: row.actual_packaging_cost == null ? null : Number(row.actual_packaging_cost), actualPaymentFee: row.actual_payment_fee == null ? null : Number(row.actual_payment_fee), actualAdvertising: row.actual_advertising_cost == null ? null : Number(row.actual_advertising_cost), actualProfit: row.actual_profit == null ? null : Number(row.actual_profit),
      }));
      setOrders(mappedOrders);
      setSelectedOrderId((current) => mappedOrders.some((order) => order.id === current && !order.isTest) ? current : undefined);
      setReviewItems(reviewRows.map((row): ReviewItem => ({ id: Number(row.id), name: String(row.title), reason: String(row.review_reason || 'Needs review'), source: String(row.retailer || 'No offer'), value: row.current_cost ? money(Number(row.current_cost)) : 'Needs review', severity: String(row.review_reason).includes('expired') ? 'urgent' : 'warning' })));
      setCatalogProducts(productRows.map((row) => ({ id: Number(row.id), slug: String(row.slug), name: String(row.title), brand: String(row.brand), model: String(row.model), packSize: String(row.pack_size), category: String(row.category), price: Number(row.selling_price), compareAt: row.original_displayed_price ? Number(row.original_displayed_price) : undefined, image: String(row.image_url || ''), images: Array.isArray(row.images) ? (row.images as { url: string; alt_text?: string }[]).map((image) => ({ url: image.url, altText: image.alt_text || String(row.title) })) : [], accent: '#e6eee9', short: String(row.description || '').slice(0, 140), description: String(row.description), specs: row.specifications as Record<string,string>, status: String(row.status) as Product['status'] })));
      if (!pricing) throw new Error('Pricing settings are not configured');
      setSettings({ minimumProfit: Number(pricing.minimum_profit), minimumMarginPercent: Number(pricing.minimum_margin_percent), standardMarkupPercent: Number(pricing.standard_markup_percent), supplierStaleHours: Number(pricing.supplier_stale_hours), freeDeliveryThreshold: Number(pricing.free_delivery_threshold), standardCustomerDelivery: Number(pricing.standard_customer_delivery) });
      setProfile(adminProfile);
      setAnalytics(analyticsData);
      setEmailDelivery(emailData);
      setNotice('');
      if (showSuccess) notify('Orders, products and the review queue are up to date.', 'success', 'Dashboard refreshed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Live data could not be loaded.';
      setNotice('Live data could not be loaded. Showing the most recent available data.'); notify(message, 'error');
    } finally { setRefreshing(false); }
  }, [notify]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  useEffect(() => {
    if (selectedOrder) setQuote((current) => ({ ...current, supplierCost: selectedOrder.supplierCost }));
  }, [selectedOrder]);
  useEffect(() => {
    if (!selectedOrderId) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedOrderId(undefined); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [selectedOrderId]);

  if (!getAdminToken()) return <Navigate to="/admin/login" replace />;

  const logout = async () => {
    if (!await confirm({ title: 'Sign out of admin?', message: 'Any unsaved form changes will be lost.', confirmLabel: 'Sign out' })) return;
    sessionStorage.removeItem(ADMIN_TOKEN_KEY); notify('You have been signed out.', 'success'); navigate('/admin/login');
  };
  const openOrder = (order: AdminOrder) => {
    if (order.isTest) return notify('This is a test order. It cannot be quoted or fulfilled.', 'info');
    if (!order.id) return notify('This order is missing its database identifier and cannot be changed.', 'warning');
    setSelectedOrderId(order.id);
    setQuote({ productRevenue: order.productRevenue, customerDelivery: order.customerDelivery, supplierCost: order.supplierCost, supplierDelivery: order.supplierDelivery, deliveryCost: order.deliveryCost, packaging: order.packaging, paymentFee: order.paymentFee, advertising: order.advertising });
    setTab('orders');
  };
  const openReview = (item: ReviewItem) => { if (!item.id) return notify('This review item is not linked to a database product.', 'warning'); setReviewProductId(item.id); setTab('products'); notify(`Opening “${item.name}” for review.`, 'info', 'Review product'); };
  const confirmQuote = async () => {
    if (!selectedOrder?.id || !['checking_supplier', 'quoted'].includes(selectedOrder.status)) return notify('Start the supplier check before confirming a quote.', 'warning');
    if (!await confirm({ title: 'Confirm this quote?', message: `Save a quote for ${selectedOrder.ref} with estimated profit of ${money(profit)} and ${margin.toFixed(1)}% margin?`, confirmLabel: 'Confirm quote' })) return;
    setSavingQuote(true);
    try {
      const result = await adminRequest<{ status:string; payment?:{ configured:boolean; paymentLink?:string; error?:string } }>(`/orders/${selectedOrder.id}/quote`, { method: 'PATCH', body: JSON.stringify({ customerDeliveryCharged: quote.customerDelivery, supplierProductCost: quote.supplierCost, supplierDelivery: quote.supplierDelivery, customerDeliveryCost: quote.deliveryCost, packagingCost: quote.packaging, paymentFeeEstimate: quote.paymentFee, advertisingCost: quote.advertising }) });
      if (result.payment?.paymentLink) notify(`Quote for ${selectedOrder.ref} was saved and its secure Yoco checkout is ready.`, 'success', 'Quote and checkout ready');
      else if (result.payment?.error) notify(result.payment.error, 'warning', 'Quote saved');
      else notify(`Quote for ${selectedOrder.ref} was saved. Create its Yoco checkout from order operations.`, 'success', 'Quote confirmed');
      await loadDashboard();
    } catch (error) { notify(error instanceof Error ? error.message : 'The quote could not be saved.', 'error'); }
    finally { setSavingQuote(false); }
  };
  const saveSettings = async () => {
    if (!settings) return notify('Pricing settings have not loaded yet.', 'warning');
    if (!await confirm({ title: 'Save pricing settings?', message: 'These guardrails will be used for product publishing, quoting and supplier freshness checks.', confirmLabel: 'Save settings' })) return;
    setSavingSettings(true);
    try { await adminRequest('/pricing-settings', { method: 'PATCH', body: JSON.stringify(settings) }); notify('Pricing and delivery guardrails were updated.', 'success', 'Settings saved'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Pricing settings could not be saved.', 'error'); }
    finally { setSavingSettings(false); }
  };
  const setting = (key: keyof PricingSettings, value: number) => setSettings((current) => current ? ({ ...current, [key]: value }) : current);
  const changeAdminPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get('currentPassword') || '');
    const newPassword = String(data.get('newPassword') || '');
    if (newPassword !== String(data.get('confirmPassword') || '')) return notify('The new passwords do not match.', 'warning', 'Check password');
    if (!await confirm({ title: 'Change administrator password?', message: 'The new password will be required the next time you sign in.', confirmLabel: 'Change password' })) return;
    setSavingPassword(true);
    try { await adminRequest('/password', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) }); form.reset(); notify('The administrator password was changed.', 'success', 'Password updated'); }
    catch (error) { notify(error instanceof Error ? error.message : 'The password could not be changed.', 'error'); }
    finally { setSavingPassword(false); }
  };
  const retryEmail = async (id: number) => {
    try { await adminRequest(`/emails/${id}/retry`, { method: 'POST' }); notify('The email was queued for another delivery attempt.', 'success', 'Email requeued'); await loadDashboard(); }
    catch (error) { notify(error instanceof Error ? error.message : 'The email could not be requeued.', 'error'); }
  };
  const initials = (profile?.name || profile?.email || 'Admin').split(/[\s@]+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  const nav = (value: Tab, icon: React.ReactNode, label: string, count?: number) => <button type="button" className={tab === value ? 'active' : ''} onClick={() => { setTab(value); setMobileNav(false); }}>{icon}<span>{label}</span>{count ? <b>{count}</b> : null}</button>;

  return <div className="admin-shell">
    <aside className={mobileNav ? 'admin-sidebar open' : 'admin-sidebar'}><div className="admin-logo"><Link className="brand light" to="/" aria-label="Mzansi Mega Ops home"><span className="brand-mark" aria-hidden="true">M</span><span>zansi</span><small>Mega Ops</small></Link><button type="button" aria-label="Close menu" onClick={() => setMobileNav(false)}><X /></button></div><nav><small>Workspace</small>{nav('overview', <LayoutDashboard />, 'Overview')}{nav('products', <Box />, 'Products')}{nav('marketing', <Share2 />, 'Share catalogue')}{nav('review', <FileSearch />, 'Review queue', reviewItems.length)}{nav('orders', <ShoppingBag />, 'Orders', realOrders.length)}<small>Manage</small>{profile?.role === 'admin' && nav('customers', <Users />, 'Customers')}{nav('settings', <Settings />, 'Pricing settings')}</nav><div className="admin-user"><span>{initials}</span><div><strong>{profile?.name || 'Administrator'}</strong><small>{profile?.email || 'Loading profile…'}</small></div><button type="button" onClick={() => void logout()} title="Sign out" aria-label="Sign out"><LogOut /></button></div></aside>
    <main className="admin-main"><header className="admin-topbar"><button type="button" className="admin-menu" aria-label="Open menu" onClick={() => setMobileNav(true)}><Menu /></button><div><h1>{tab === 'overview' ? 'Operations overview' : tab === 'review' ? 'Review queue' : tab[0].toUpperCase() + tab.slice(1)}</h1><p>{tab === 'overview' ? 'Live information from the store database.' : 'Mzansi Mega Store operations workspace'}</p></div><div className="admin-actions"><label><Search /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search products, orders or reviews" placeholder={tab === 'products' ? 'Search products in real time' : 'Search products, orders or reviews'} /></label><button type="button" className="bell" aria-label="Open review notifications" title="Open review notifications" onClick={() => { setTab('review'); notify(`${reviewItems.length} product${reviewItems.length === 1 ? '' : 's'} need review.`, 'info', 'Review queue'); }}><Bell /><i /></button><a className="view-store" href="/" target="_blank" rel="noreferrer">View store <ArrowUpRight /></a></div></header>
      {tab === 'overview' && <div className="admin-content">{notice && <p className="admin-notice">{notice}</p>}
        <section className="attention-banner"><AlertTriangle /><div><strong>{reviewItems.length} items need attention</strong><span>Review supplier prices, promotion dates and exact product matches before publishing.</span></div><button type="button" onClick={() => setTab('review')}>Open review queue <ChevronRight /></button></section>
        <section className="metric-grid"><div><span><ShoppingBag /></span><p>Orders to action</p><strong>{actionableOrders.length}</strong><small><ArrowUpRight /> Real orders only</small></div><div><span><FileSearch /></span><p>Pending review</p><strong>{Number(analytics?.summary.review_products ?? reviewItems.length)}</strong><small className="warn">Human check required</small></div><div><span><CircleDollarSign /></span><p>Confirmed revenue</p><strong>{money(Number(analytics?.summary.confirmed_revenue || 0))}</strong><small><ArrowUpRight /> Paid real orders only</small></div><div><span><PackageCheck /></span><p>Catalogue products</p><strong>{Number(analytics?.summary.total_products ?? catalogProducts.length)}</strong><small className="muted"><ArrowDownRight /> Complete database count</small></div></section>
        <AdminAnalytics data={analytics} />
        <div className="admin-columns"><section className="admin-card"><div className="card-heading"><div><p className="kicker">Live workflow</p><h2>Orders needing action</h2></div><button type="button" onClick={() => setTab('orders')}>View all <ChevronRight /></button></div><div className="order-list">{visibleActionableOrders.map((order) => <div key={order.ref}><span className="order-avatar">{order.customer.split(' ').map((part) => part[0]).join('')}</span><div className="order-person"><strong>{order.customer}</strong><span>{order.ref} · {order.items}</span></div><StatusPill status={order.status} /><div className="order-value"><strong>{money(order.total)}</strong><span>{order.age}</span></div><button type="button" aria-label={`Open ${order.ref}`} onClick={() => openOrder(order)}><ChevronRight /></button></div>)}</div>{visibleActionableOrders.length === 0 && <div className="admin-empty"><PackageCheck /><p>No real orders currently need action.</p></div>}</section>
          <section className="admin-card review-card"><div className="card-heading"><div><p className="kicker">Risk watch</p><h2>Review next</h2></div><button type="button" onClick={() => setTab('review')}>View queue <ChevronRight /></button></div>{visibleReviews.map((item) => <article key={item.name}><i className={item.severity}><AlertTriangle /></i><div><strong>{item.name}</strong><span>{item.reason}</span><small>{item.source} · {item.value}</small></div><button type="button" aria-label={`Review ${item.name}`} onClick={() => openReview(item)}><ChevronRight /></button></article>)}{visibleReviews.length === 0 && <div className="admin-empty"><PackageCheck /><p>No products currently require review.</p></div>}</section></div>
        <section className="admin-card activity-card"><div className="card-heading"><div><p className="kicker">Live database</p><h2>Operations pulse</h2></div><button type="button" className="outline-button" disabled={refreshing} onClick={() => void loadDashboard(true)}><RefreshCw /> {refreshing ? 'Refreshing…' : 'Refresh data'}</button></div><div className="pulse-grid"><div><BarChart3 /><strong>{publishedProducts}</strong><span>Published products</span></div><div><RefreshCw /><strong>{reviewItems.length}</strong><span>Products requiring review</span></div><div><Clock3 /><strong>{quotedOrders}</strong><span>Quoted or awaiting payment</span></div><div><Users /><strong>{completedOrders}</strong><span>Delivered orders</span></div></div></section>
      </div>}
      {tab === 'products' && <div className="admin-content"><section className="context-metrics"><div><span>Total products</span><strong>{Number(analytics?.summary.total_products ?? catalogProducts.length)}</strong></div><div><span>Published</span><strong>{Number(analytics?.summary.published_products ?? publishedProducts)}</strong></div><div><span>Needs review</span><strong>{Number(analytics?.summary.review_products ?? reviewItems.length)}</strong></div><div><span>Paused</span><strong>{Number(analytics?.summary.paused_products || 0)}</strong></div></section><ProductManager searchQuery={search} onChanged={() => void loadDashboard()} initialEditId={reviewProductId} onInitialEditHandled={() => setReviewProductId(undefined)} /></div>}
      {tab === 'marketing' && <div className="admin-content"><section className="context-metrics"><div><span>Shareable products</span><strong>{publishedProducts}</strong></div><div><span>Maximum per catalogue</span><strong>24</strong></div><div><span>Social networks</span><strong>4</strong></div><div><span>Preview format</span><strong>Large image</strong></div></section><CatalogueShareManager products={catalogProducts} /></div>}
      {tab === 'review' && <div className="admin-content"><section className="context-metrics"><div><span>Total waiting</span><strong>{reviewItems.length}</strong></div><div><span>Urgent / expired</span><strong>{urgentReviews}</strong></div><div><span>Price or margin</span><strong>{pricingReviews}</strong></div><div><span>Supplier or stock</span><strong>{supplierReviews}</strong></div></section><section className="admin-card review-table"><div className="card-heading"><div><p className="kicker">Human verification required</p><h2>{visibleReviews.length} items waiting</h2></div><button type="button" className="outline-button" disabled={refreshing} onClick={() => void loadDashboard(true)}><RefreshCw /> {refreshing ? 'Refreshing…' : 'Refresh queue'}</button></div>{visibleReviews.map((item) => <article key={item.name}><i className={item.severity}><AlertTriangle /></i><div><strong>{item.name}</strong><span>{item.reason}</span></div><div><small>Source</small><b>{item.source}</b></div><div><small>Change</small><b>{item.value}</b></div><button type="button" className="outline-button" onClick={() => openReview(item)}>Review <ChevronRight /></button></article>)}{visibleReviews.length === 0 && <div className="admin-empty"><PackageCheck /><p>No products currently require review.</p></div>}</section></div>}
      {tab === 'orders' && <div className="admin-content"><section className="context-metrics"><div><span>Customer orders</span><strong>{realOrders.length}</strong></div><div><span>Active</span><strong>{actionableOrders.length}</strong></div><div><span>Awaiting payment</span><strong>{Number(analytics?.summary.awaiting_payment || 0)}</strong></div><div><span>Paid orders</span><strong>{Number(analytics?.summary.paid_orders || 0)}</strong></div></section><section className="admin-card orders-table-card"><div className="card-heading"><div><p className="kicker">Order queue</p><h2>Customer orders</h2></div></div><div className="order-list">{visibleOrders.map((order) => <div className={order.id && order.id === selectedOrderId ? 'selected' : ''} key={order.ref}><span className="order-avatar">{order.customer.slice(0, 2).toUpperCase()}</span><div className="order-person"><strong>{order.customer}</strong><span>{order.ref} · {order.items}</span></div><StatusPill status={order.status} /><div className="order-value"><strong>{money(order.total)}</strong><span>{order.age}</span></div><button type="button" className="outline-button" onClick={() => openOrder(order)}>Order details</button></div>)}</div>{visibleOrders.length === 0 && <div className="admin-empty"><ShoppingBag /><p>No customer orders in the database.</p></div>}</section>
        {selectedOrder && <div className="product-modal-backdrop order-operations-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedOrderId(undefined); }}><section className="product-modal order-operations-modal" role="dialog" aria-modal="true" aria-labelledby="order-operations-title"><header><div><p className="kicker">Order operations</p><h2 id="order-operations-title">{selectedOrder.ref}</h2></div><button type="button" aria-label="Close order operations" onClick={() => setSelectedOrderId(undefined)}><X /></button></header><div className="order-operations-body"><OrderWorkflow key={selectedOrder.ref} order={selectedOrder} onChanged={() => loadDashboard()} /><section className="quote-card"><div className="card-heading"><div><p className="kicker">Quote and costs</p><h2>Order pricing</h2></div></div><div className="quote-fields">{Object.entries(quote).map(([key, value]) => <label key={key}><span>{key.replace(/([A-Z])/g, ' $1')}</span><div>R <input type="number" min="0" step="0.01" value={value} readOnly={key === 'productRevenue' || key === 'supplierCost'} onChange={(event) => setQuote({ ...quote, [key]: Number(event.target.value) })} /></div></label>)}</div><div className={profit >= (settings?.minimumProfit || 0) && margin >= (settings?.minimumMarginPercent || 0) ? 'profit-box healthy' : 'profit-box danger'}><span>Expected profit</span><strong>{money(profit)}</strong><small>{margin.toFixed(1)}% margin</small></div><button type="button" className="solid-button full" disabled={savingQuote || !['checking_supplier', 'quoted'].includes(selectedOrder.status)} onClick={() => void confirmQuote()}><Check /> {savingQuote ? 'Saving quote…' : 'Confirm quote'}</button><p className="quote-warning">Verify supplier costs and availability, then confirm the quote. Payment must still be independently verified.</p></section></div></section></div>}
      </div>}
      {tab === 'customers' && profile?.role === 'admin' && <div className="admin-content"><section className="context-metrics"><div><span>Registered customers</span><strong>{Number(analytics?.summary.customers || 0)}</strong></div><div><span>Real requests</span><strong>{realOrders.length}</strong></div><div><span>Paid customers</span><strong>{Number(analytics?.summary.paid_orders || 0)}</strong></div><div><span>Delivered orders</span><strong>{Number(analytics?.summary.delivered_orders || 0)}</strong></div></section><CustomerManager /></div>}
      {tab === 'settings' && <div className="admin-content">{settings && <section className="context-metrics"><div><span>Regular markup</span><strong>{settings.standardMarkupPercent}%</strong></div><div><span>Minimum margin</span><strong>{settings.minimumMarginPercent}%</strong></div><div><span>Free delivery</span><strong>{money(settings.freeDeliveryThreshold)}</strong></div><div><span>Supplier freshness</span><strong>{settings.supplierStaleHours}h</strong></div></section>}<section className="admin-card settings-card"><div className="card-heading"><div><p className="kicker">Guardrails</p><h2>Pricing settings</h2></div></div>{settings ? <><p>Promotion price: source sale price × 1.15, capped one cent below the normal source price. Regular price: source price plus the markup below.</p><div className="settings-grid"><label>Regular product markup<div><input type="number" min="5" max="10" step="0.1" value={settings.standardMarkupPercent} onChange={(event) => setting('standardMarkupPercent', Number(event.target.value))} /> %</div><small>Choose 5–10%; default 7%.</small></label><label>Minimum expected profit<div>R <input type="number" min="0" value={settings.minimumProfit} onChange={(event) => setting('minimumProfit', Number(event.target.value))} /></div><small>Products below this value go to review.</small></label><label>Minimum margin<div><input type="number" min="0" max="100" value={settings.minimumMarginPercent} onChange={(event) => setting('minimumMarginPercent', Number(event.target.value))} /> %</div><small>Calculated after all attributable costs.</small></label><label>Supplier data stale after<div><input type="number" min="1" max="168" value={settings.supplierStaleHours} onChange={(event) => setting('supplierStaleHours', Number(event.target.value))} /> hours</div><small>Listings are paused when data becomes stale.</small></label><label>Free customer delivery from<div>R <input type="number" min="0" value={settings.freeDeliveryThreshold} onChange={(event) => setting('freeDeliveryThreshold', Number(event.target.value))} /></div><small>The threshold applies to the complete cart.</small></label><label>Standard customer delivery<div>R <input type="number" min="0" value={settings.standardCustomerDelivery} onChange={(event) => setting('standardCustomerDelivery', Number(event.target.value))} /></div><small>Used below the free-delivery threshold.</small></label></div><button type="button" className="solid-button" disabled={savingSettings} onClick={() => void saveSettings()}>{savingSettings ? 'Saving…' : 'Save settings'}</button></> : <p className="table-loading">Loading pricing settings from the database…</p>}</section><section className="admin-card settings-card email-delivery-card"><div className="card-heading"><div><p className="kicker">Transactional email</p><h2>Email delivery</h2></div></div>{emailDelivery ? <><div className="email-delivery-summary"><span><b>{emailDelivery.summary.pending + emailDelivery.summary.processing}</b> queued</span><span><b>{emailDelivery.summary.sent}</b> sent</span><span className={emailDelivery.summary.failed ? 'has-failures' : ''}><b>{emailDelivery.summary.failed}</b> failed</span></div><div className="email-delivery-list">{emailDelivery.messages.slice(0, 12).map((message) => <article key={message.id}><div><strong>{message.subject}</strong><span>{message.recipient_name || message.recipient_email} · {message.recipient_email}</span>{message.last_error && <small>{message.last_error}</small>}</div><StatusPill status={message.status} />{message.status === 'failed' && <button type="button" className="outline-button" onClick={() => void retryEmail(message.id)}>Retry</button>}</article>)}</div>{emailDelivery.messages.length === 0 && <p>No transactional emails have been queued yet.</p>}</> : <p className="table-loading">Loading email delivery status…</p>}</section><section className="admin-card settings-card"><div className="card-heading"><div><p className="kicker">Security</p><h2>Change administrator password</h2></div></div><form className="settings-grid" onSubmit={changeAdminPassword}><label>Current password<AdminPasswordInput name="currentPassword" label="Current password" autoComplete="current-password" /></label><label>New password<AdminPasswordInput name="newPassword" label="New password" autoComplete="new-password" /><small>Use at least 12 characters.</small></label><label>Confirm new password<AdminPasswordInput name="confirmPassword" label="Confirm new password" autoComplete="new-password" /></label><button className="solid-button" disabled={savingPassword}>{savingPassword ? 'Changing…' : 'Change password'}</button></form></section></div>}
    </main>
  </div>;
}
