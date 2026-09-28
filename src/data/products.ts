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
  accent: string;
  badge?: string;
  short: string;
  description: string;
  specs: Record<string, string>;
  status: 'published' | 'pending_review' | 'paused';
  freshness: string;
};

export const products: Product[] = [
  {
    id: 1,
    slug: 'wahl-cutek-wh5439-216-hairdryer',
    name: 'Wahl Cutek Hairdryer',
    brand: 'Wahl',
    model: 'WH5439-216',
    packSize: '1 unit',
    category: 'Hair care',
    price: 649,
    compareAt: 799,
    image: '',
    accent: '#f3e9df',
    badge: 'Save R150',
    short: 'Salon-ready drying power for an easy everyday finish.',
    description: 'A compact, easy-handling dryer designed for reliable home styling. Product details and supplier availability are checked before you pay.',
    specs: { 'Model': 'WH5439-216', 'Colour': 'Black', 'Type': 'Corded hairdryer', 'Pack size': '1 unit' },
    status: 'published',
    freshness: 'Checked today',
  },
  {
    id: 2,
    slug: 'pampers-pants-active-baby-size-6-96',
    name: 'Pampers Pants Active Baby',
    brand: 'Pampers',
    model: 'Size 6',
    packSize: '96 pack',
    category: 'Baby',
    price: 849,
    compareAt: 999,
    image: '',
    accent: '#dfeff0',
    badge: 'Family value',
    short: 'Easy-change pants for active little explorers, in a value pack.',
    description: 'A family-size pack of pull-up pants for active babies. Exact size, pack count, supplier stock and checkout cost are verified before payment.',
    specs: { 'Size': '6', 'Pack count': '96', 'Format': 'Pull-up pants', 'Range': 'Active Baby' },
    status: 'published',
    freshness: 'Checked today',
  },
  {
    id: 3,
    slug: 'wahl-barber-kit-9247',
    name: 'Wahl Home Barber Kit',
    brand: 'Wahl',
    model: '9247',
    packSize: 'Complete kit',
    category: 'Grooming',
    price: 1099,
    compareAt: 1299,
    image: '',
    accent: '#efe1cd',
    badge: 'Free delivery',
    short: 'The essentials for confident cuts and tidy touch-ups at home.',
    description: 'A practical corded clipper kit with guide combs and grooming accessories. Contents and supplier stock are confirmed before payment.',
    specs: { 'Model': '9247', 'Power': 'Corded', 'Use': 'Home grooming', 'Pack size': 'Complete kit' },
    status: 'published',
    freshness: 'Checked today',
  },
];

export const money = (value: number) => new Intl.NumberFormat('en-ZA', {
  style: 'currency', currency: 'ZAR', maximumFractionDigits: 0,
}).format(value);

export const FREE_DELIVERY_THRESHOLD = 999;
export const STANDARD_DELIVERY = 89;
