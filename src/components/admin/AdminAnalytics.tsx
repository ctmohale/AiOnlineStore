import { AlertTriangle, BarChart3, CircleDollarSign, PackageCheck, ShoppingBag, TrendingUp } from 'lucide-react';
import { money } from '../../data/products';

export type AnalyticsData = {
  summary: Record<string, number | null>;
  projection: { basis: string; basis_days: number; projected_monthly_revenue: number; projected_monthly_profit: number };
  daily: { day: string; orders: number; revenue: number; profit: number }[];
  statuses: { status: string; count: number }[];
  generatedAt: string;
};

const number = (value: number | null | undefined) => Number(value || 0);

export default function AdminAnalytics({ data }: { data: AnalyticsData | null }) {
  if (!data) return <section className="admin-card analytics-loading">Loading verified operational analytics…</section>;
  const summary = data.summary;
  const maxRevenue = Math.max(1, ...data.daily.map((item) => number(item.revenue)));
  const maxStatus = Math.max(1, ...data.statuses.map((item) => number(item.count)));
  const onTime = summary.on_time_delivery_rate == null ? 'No SLA data' : `${number(summary.on_time_delivery_rate).toFixed(0)}%`;
  return <>
    <section className="analytics-metrics" aria-label="Commercial performance">
      <article><CircleDollarSign /><span>Confirmed revenue</span><strong>{money(number(summary.confirmed_revenue))}</strong><small>Paid real orders only</small></article>
      <article><TrendingUp /><span>Realised / expected profit</span><strong>{money(number(summary.realised_profit))}</strong><small>Actual costs used when captured</small></article>
      <article><ShoppingBag /><span>Average order value</span><strong>{money(number(summary.average_order_value))}</strong><small>{number(summary.paid_orders)} paid orders</small></article>
      <article><BarChart3 /><span>Payment conversion</span><strong>{number(summary.payment_conversion_rate).toFixed(1)}%</strong><small>Paid ÷ all real requests</small></article>
      <article className={number(summary.orders_at_risk) ? 'risk' : ''}><AlertTriangle /><span>Orders at risk</span><strong>{number(summary.orders_at_risk)}</strong><small>Late estimate or untouched 24h+</small></article>
      <article><PackageCheck /><span>On-time delivery</span><strong>{onTime}</strong><small>Against captured delivery dates</small></article>
    </section>
    <section className="analytics-grid">
      <div className="admin-card chart-card"><div className="card-heading"><div><p className="kicker">Last 30 days</p><h2>Revenue activity</h2></div><small>Real orders only</small></div>
        {data.daily.length ? <div className="bar-chart" aria-label="Revenue by order date">{data.daily.map((item) => <div className="bar-column" key={String(item.day)} title={`${String(item.day).slice(0,10)}: ${money(number(item.revenue))}`}><span style={{ height: `${Math.max(6, number(item.revenue) / maxRevenue * 100)}%` }} /><small>{new Date(item.day).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })}</small></div>)}</div> : <p className="analytics-empty">No real order activity in the last 30 days.</p>}
      </div>
      <div className="admin-card chart-card"><div className="card-heading"><div><p className="kicker">Pipeline</p><h2>Orders by status</h2></div></div>
        {data.statuses.length ? <div className="status-chart">{data.statuses.map((item) => <div key={item.status}><span>{item.status.replaceAll('_',' ')}</span><i><b style={{ width: `${number(item.count) / maxStatus * 100}%` }} /></i><strong>{item.count}</strong></div>)}</div> : <p className="analytics-empty">No real orders yet.</p>}
      </div>
      <div className="admin-card projection-card"><div><p className="kicker">Transparent projection</p><h2>Current monthly run rate</h2><span>{data.projection.basis}</span></div><article><small>Projected revenue</small><strong>{money(number(data.projection.projected_monthly_revenue))}</strong></article><article><small>Projected profit</small><strong>{money(number(data.projection.projected_monthly_profit))}</strong></article><p>Based on {data.projection.basis_days} calendar day{data.projection.basis_days === 1 ? '' : 's'} elapsed. This is a run-rate estimate, not a guarantee.</p></div>
    </section>
  </>;
}
