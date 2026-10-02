import type { Product } from '../data/products';

export const CATEGORY_NAMES = ['Baby', 'Cellphones', 'Laptops', 'Television', 'Fridges', 'Furniture', 'Garden Tools', 'Personal Care'];

const comparable = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim();

// Keep supplier catalogue categories separate; baby products have one dedicated category.
export const categoryGroupFor = (category: string, productDetails = '') => {
  const value = comparable(`${category} ${productDetails}`);
  if (/\b(baby|babies|nursery|toddler|toddlers|nappies|nappy|diapers|diaper)\b/.test(value)
    || ['bath time', 'activity feeding chairs', 'bathing changing'].includes(comparable(category))) return 'Baby';
  const label = category.replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!label) return 'General';
  return label.split(' ').map((word) => /^(diy|pvc|uhd|usb|led|tv|pc|gsm)$/i.test(word)
    ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

export const matchesCategory = (productCategory: string, selectedCategory: string, productDetails = '') => selectedCategory === 'All'
  || productCategory === selectedCategory
  || comparable(categoryGroupFor(productCategory, productDetails)) === comparable(selectedCategory);

export const categorySummaries = (products: Product[]) => {
  const counts = new Map<string, { name: string; count: number }>();
  for (const product of products) {
    const name = categoryGroupFor(product.category, `${product.name} ${product.brand} ${product.model}`);
    const key = comparable(name);
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { name, count: 1 });
  }
  return [...counts.values()].sort((a, b) => a.name === 'Baby' ? -1 : b.name === 'Baby' ? 1 : a.name.localeCompare(b.name));
};
