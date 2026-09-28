import { Archive, Edit3, PackagePlus, RefreshCw, Save, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import StatusPill from '../StatusPill';
import { money } from '../../data/products';
import { adminRequest } from '../../lib/api';

type AdminProduct = {
  id: number; title: string; brand: string; model: string; barcode: string | null; pack_size: string; category: string;
  description: string; specifications: Record<string, string> | string; selling_price: number; status: string; image_url: string | null;
  retailer?: string | null; last_checked_at?: string | null;
};

const emptyProduct = { title: '', brand: '', model: '', barcode: '', packSize: '', category: '', description: '', sellingPrice: '', imageUrl: '', specifications: '' };

const specificationsText = (value: AdminProduct['specifications']) => {
  let specs: Record<string, string> = {};
  try { specs = typeof value === 'string' ? JSON.parse(value || '{}') : value || {}; }
  catch { specs = {}; }
  return Object.entries(specs).map(([key, item]) => `${key}: ${item}`).join('\n');
};
const parseSpecifications = (text: string) => Object.fromEntries(text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => { const separator = line.indexOf(':'); return separator < 1 ? [line, ''] : [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]; }));

export default function ProductManager({ onChanged }: { onChanged?: () => void }) {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    try { setProducts(await adminRequest<AdminProduct[]>('/products')); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Products could not be loaded'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const add = () => { setEditing(null); setForm(emptyProduct); setMessage(''); setOpen(true); };
  const edit = (product: AdminProduct) => {
    setEditing(product);
    setForm({ title: product.title, brand: product.brand, model: product.model, barcode: product.barcode || '', packSize: product.pack_size, category: product.category, description: product.description, sellingPrice: String(product.selling_price), imageUrl: product.image_url || '', specifications: specificationsText(product.specifications) });
    setMessage(''); setOpen(true);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage('');
    const payload = { ...form, sellingPrice: Number(form.sellingPrice), barcode: form.barcode || null, imageUrl: form.imageUrl || null, specifications: parseSpecifications(form.specifications), ...(!editing ? { status: 'draft' } : {}) };
    try {
      await adminRequest(editing ? `/products/${editing.id}` : '/products', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      setOpen(false); await load();
      setMessage(editing ? 'Product updated and sent for recheck if it was published.' : 'Product created as a draft. Add and verify a supplier offer before publishing.');
      onChanged?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Product could not be saved'); }
    finally { setSaving(false); }
  };
  const archive = async (product: AdminProduct) => {
    if (!window.confirm(`Archive “${product.title}”? It will disappear from the storefront but its history will be preserved.`)) return;
    try { await adminRequest(`/products/${product.id}`, { method: 'DELETE' }); await load(); setMessage('Product archived safely.'); onChanged?.(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Product could not be archived'); }
  };
  const field = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return <>
    <section className="admin-card table-card product-manager"><div className="card-heading"><div><p className="kicker">Catalogue CRUD</p><h2>Products</h2></div><div className="product-actions"><button className="outline-button" onClick={() => void load()}><RefreshCw /> Refresh</button><button className="solid-button" onClick={add}><PackagePlus /> Add product</button></div></div>
      {message && <p className="admin-notice">{message}</p>}
      {loading ? <p className="table-loading">Loading products…</p> : <div className="data-table"><div className="table-head product-table-grid"><span>Product</span><span>Status</span><span>Selling price</span><span>Supplier</span><span>Last checked</span><span>Actions</span></div>{products.map((product) => <div className="table-row product-table-grid" key={product.id}><span><i className="table-thumb">{product.brand[0]}</i><b>{product.title}<small>{product.model} · {product.pack_size}</small></b></span><StatusPill status={product.status} /><strong>{money(Number(product.selling_price))}</strong><span>{product.retailer || 'No offer'}</span><span>{product.last_checked_at ? new Date(product.last_checked_at).toLocaleDateString('en-ZA') : 'Not checked'}</span><span className="row-actions"><button title="Edit product" onClick={() => edit(product)}><Edit3 /></button><button title="Archive product" className="danger" onClick={() => void archive(product)}><Archive /></button></span></div>)}</div>}
      {!loading && products.length === 0 && <div className="account-empty"><PackagePlus /><h3>No active products</h3><p>Create the first catalogue draft to begin supplier review.</p></div>}
    </section>
    {open && <div className="product-modal-backdrop" role="presentation"><section className="product-modal" role="dialog" aria-modal="true" aria-labelledby="product-form-title"><header><div><p className="kicker">{editing ? 'Edit catalogue item' : 'New catalogue item'}</p><h2 id="product-form-title">{editing ? editing.title : 'Add a product'}</h2></div><button onClick={() => setOpen(false)} aria-label="Close product form"><X /></button></header><form onSubmit={submit}><div className="product-form-grid"><label>Product title<input value={form.title} onChange={(event) => field('title', event.target.value)} required minLength={3} /></label><label>Category<input value={form.category} onChange={(event) => field('category', event.target.value)} required /></label><label>Brand<input value={form.brand} onChange={(event) => field('brand', event.target.value)} required /></label><label>Model / SKU<input value={form.model} onChange={(event) => field('model', event.target.value)} required /></label><label>Barcode <span>(optional)</span><input value={form.barcode} onChange={(event) => field('barcode', event.target.value)} /></label><label>Pack size<input value={form.packSize} onChange={(event) => field('packSize', event.target.value)} placeholder="e.g. 96 pack" required /></label><label>Selling price (ZAR)<input type="number" min="0.01" step="0.01" value={form.sellingPrice} onChange={(event) => field('sellingPrice', event.target.value)} required /></label><label>Rights-cleared image URL <span>(optional)</span><input type="url" value={form.imageUrl} onChange={(event) => field('imageUrl', event.target.value)} placeholder="https://…" /></label><label className="full-field">Description<textarea rows={4} value={form.description} onChange={(event) => field('description', event.target.value)} required minLength={10} /></label><label className="full-field">Specifications <span>(one “Name: Value” per line)</span><textarea rows={5} value={form.specifications} onChange={(event) => field('specifications', event.target.value)} placeholder={'Model: WH5439-216\nColour: Black\nWarranty: 2 years'} /></label></div>{message && <p className="form-error">{message}</p>}<div className="product-form-actions"><button type="button" className="outline-button" onClick={() => setOpen(false)}>Cancel</button><button className="solid-button" disabled={saving}><Save /> {saving ? 'Saving…' : editing ? 'Save changes' : 'Create draft'}</button></div></form></section></div>}
  </>;
}
