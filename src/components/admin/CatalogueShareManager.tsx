import { Search, Share2, SquareCheckBig } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Product } from '../../data/products';
import ShareActions from '../ShareActions';
import { useFeedback } from '../FeedbackProvider';

export default function CatalogueShareManager({ products }: { products: Product[] }) {
  const { notify } = useFeedback(); const [query, setQuery] = useState(''); const [title, setTitle] = useState('Moya Market selected deals'); const [selected, setSelected] = useState<Set<number>>(new Set());
  const published = products.filter((product) => product.status === 'published');
  const visible = useMemo(() => published.filter((product) => `${product.name} ${product.brand} ${product.category}`.toLowerCase().includes(query.toLowerCase())).slice(0, 100), [published, query]);
  const toggle = (id: number) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else if (next.size < 24) next.add(id); else notify('A shared catalogue can contain up to 24 products.', 'warning'); return next; });
  const url = `${window.location.origin}/catalog?ids=${[...selected].join(',')}&title=${encodeURIComponent(title.trim() || 'Moya Market selected deals')}`;
  return <section className="admin-card catalogue-share-manager"><div className="card-heading"><div><p className="kicker">Social selling</p><h2>Share a product catalogue</h2></div><Share2 /></div><p>Select up to 24 live products. The link opens a branded catalogue and includes a social preview image, title and description.</p>
    <div className="catalogue-share-controls"><label>Catalogue title<input value={title} maxLength={90} onChange={(event) => setTitle(event.target.value)} /></label><label className="catalogue-search"><span>Find products</span><div><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, brand or category" /></div></label></div>
    <div className="catalogue-selection-summary"><strong>{selected.size} / 24 selected</strong><button type="button" onClick={() => setSelected(new Set(visible.slice(0, 12).map((product) => product.id)))}>Select first 12</button><button type="button" onClick={() => setSelected(new Set())}>Clear</button></div>
    <div className="catalogue-product-picker">{visible.map((product) => <label className={selected.has(product.id) ? 'selected' : ''} key={product.id}><input type="checkbox" checked={selected.has(product.id)} onChange={() => toggle(product.id)} /><span>{product.image ? <img src={product.image} alt="" /> : product.brand.slice(0, 1)}</span><div><strong>{product.name}</strong><small>{product.category} · R{product.price.toFixed(0)}</small></div>{selected.has(product.id) && <SquareCheckBig />}</label>)}</div>
    {selected.size > 0 && <div className="catalogue-share-result"><label>Shareable catalogue URL<input readOnly value={url} onFocus={(event) => event.currentTarget.select()} /></label><ShareActions compact url={url} title={title} text={`View ${title} from Moya Market.`} /><a className="outline-button" href={url} target="_blank" rel="noreferrer">Preview catalogue</a></div>}
  </section>;
}
