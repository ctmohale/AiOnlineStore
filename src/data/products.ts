export type Product = {
  id: number;
  slug: string;
  name: string;
  brand: string;
  model: string;
  packSize: string;
  category: string;
  price: number;
  compareAt?: number;
  image: string;
  images?: { url: string; altText: string }[];
  accent: string;
  badge?: string;
  short: string;
  description: string;
  specs: Record<string, string>;
  status: 'draft' | 'pending_review' | 'published' | 'paused' | 'unavailable';
};

export type PublicProductRow = {
  id: number; slug: string; title: string; brand: string; model: string; pack_size: string; category: string;
  description: string; specifications: Record<string, string> | string | null; selling_price: number;
  original_displayed_price?: number | null; image_url: string | null;
  images?: { url: string; alt_text?: string; sort_order?: number }[];
};

const accents = ['#f3e9df', '#dfeff0', '#efe1cd', '#e6eee9', '#f1e6e2'];
const parseSpecs = (value: PublicProductRow['specifications']) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value) as Record<string, string>; } catch { return {}; }
};

export const mapPublicProduct = (row: PublicProductRow): Product => {
  const images = (row.images || []).filter((item) => item.url).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)).map((item) => ({ url: item.url, altText: item.alt_text || row.title }));
  if (!images.length && row.image_url) images.push({ url: row.image_url, altText: row.title });
  return ({
  id: Number(row.id), slug: row.slug, name: row.title, brand: row.brand || '', model: row.model || '', packSize: row.pack_size || '',
  category: row.category, price: Number(row.selling_price), compareAt: row.original_displayed_price && Number(row.original_displayed_price) > Number(row.selling_price) ? Number(row.original_displayed_price) : undefined,
  image: images[0]?.url || '', images, accent: accents[Number(row.id) % accents.length], short: row.description?.slice(0, 140) || '', description: row.description || '',
  specs: parseSpecs(row.specifications), status: 'published',
  });
};

export const money = (value: number) => new Intl.NumberFormat('en-ZA', {
  style: 'currency', currency: 'ZAR', maximumFractionDigits: 0,
}).format(value);
