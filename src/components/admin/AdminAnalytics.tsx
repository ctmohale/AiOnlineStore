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
  const generatedAt = Number.isNaN(Date.parse(data.generatedAt)) ? new Date() : new Date(data.generatedAt);
  const fallbackDaily = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(generatedAt);
    day.setDate(day.getDate() - (6 - index));
    return { day: day.toISOString(), orders: 0, revenue: 0, profit: 0 };
  });
  const chartData = data.daily.length ? data.daily : fallbackDaily;
  const chartValues = chartData.flatMap((item) => [number(item.revenue), number(item.profit)]);
  const maxValue = Math.max(0, ...chartValues);
  const minValue = Math.min(0, ...chartValues);
  const valueRange = Math.max(1, maxValue - minValue);
  const chart = { left: 76, right: 20, top: 18, bottom: 44, width: 900, height: 270 };
  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;
  const x = (index: number) => chart.left + index / Math.max(1, chartData.length - 1) * plotWidth;
  const y = (value: number) => chart.top + (maxValue - value) / valueRange * plotHeight;
  const points = (key: 'revenue' | 'profit') => chartData.map((item, index) => `${x(index)},${y(number(item[key]))}`).join(' ');
  const dateIndexes = [...new Set([0, .25, .5, .75, 1].map((ratio) => Math.round((chartData.length - 1) * ratio)))];
  const gridLines = [0, .25, .5, .75, 1];
  const maxStatus = Math.max(1, ...data.statuses.map((item) => number(item.count)));
  return <>
    <section className="admin-card analytics-trend-card" aria-labelledby="financial-trend-heading">
      <div className="card-heading"><div><p className="kicker">Last 30 days</p><h2 id="financial-trend-heading">Revenue and profit trend</h2></div><div className="line-chart-legend" aria-label="Chart legend"><span><i className="revenue" /> Revenue</span><span><i className="profit" /> Profit</span></div></div>
      <div className="line-chart-wrap">
        <svg className="line-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-labelledby="financial-chart-title financial-chart-description">
          <title id="financial-chart-title">Revenue and profit by order date</title>
          <desc id="financial-chart-description">A line chart showing paid real-order revenue and profit over the last 30 days.</desc>
          {gridLines.map((ratio) => { const lineY = chart.top + ratio * plotHeight; const value = maxValue - ratio * valueRange; return <g className="line-chart-grid" key={ratio}><line x1={chart.left} x2={chart.width - chart.right} y1={lineY} y2={lineY} /><text x={chart.left - 10} y={lineY + 4}>{money(value)}</text></g>; })}
          {minValue < 0 && <line className="line-chart-zero" x1={chart.left} x2={chart.width - chart.right} y1={y(0)} y2={y(0)} />}
          <polyline className="line-series revenue" points={points('revenue')} />
          <polyline className="line-series profit" points={points('profit')} />
          {chartData.map((item, index) => <g key={`${item.day}-${index}`}><circle className="line-point revenue" cx={x(index)} cy={y(number(item.revenue))} r="4"><title>{`${new Date(item.day).toLocaleDateString('en-ZA', { dateStyle: 'medium' })}: revenue ${money(number(item.revenue))}`}</title></circle><circle className="line-point profit" cx={x(index)} cy={y(number(item.profit))} r="4"><title>{`${new Date(item.day).toLocaleDateString('en-ZA', { dateStyle: 'medium' })}: profit ${money(number(item.profit))}`}</title></circle></g>)}
          {dateIndexes.map((index) => <text className="line-chart-date" x={x(index)} y={chart.height - 12} key={index}>{new Date(chartData[index].day).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })}</text>)}
        </svg>
        {!data.daily.length && <p className="line-chart-empty">No paid order activity yet. New revenue and profit will appear here.</p>}
      </div>
    </section>
    <section className="analytics-grid">
      <div className="admin-card chart-card"><div className="card-heading"><div><p className="kicker">Pipeline</p><h2>Orders by status</h2></div></div>
        {data.statuses.length ? <div className="status-chart">{data.statuses.map((item) => <div key={item.status}><span>{item.status.replaceAll('_',' ')}</span><i><b style={{ width: `${number(item.count) / maxStatus * 100}%` }} /></i><strong>{item.count}</strong></div>)}</div> : <p className="analytics-empty">No real orders yet.</p>}
      </div>
      <div className="admin-card projection-card"><div><p className="kicker">Transparent projection</p><h2>Current monthly run rate</h2><span>{data.projection.basis}</span></div><article><small>Projected revenue</small><strong>{money(number(data.projection.projected_monthly_revenue))}</strong></article><article><small>Projected profit</small><strong>{money(number(data.projection.projected_monthly_profit))}</strong></article><p>Based on {data.projection.basis_days} calendar day{data.projection.basis_days === 1 ? '' : 's'} elapsed. This is a run-rate estimate, not a guarantee.</p></div>
    </section>
  </>;
}
