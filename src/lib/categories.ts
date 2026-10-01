import type { Product } from '../data/products';

export const CATEGORY_GROUPS = [
  { name: 'Electronics & Computing', keywords: ['handset','mobile','cellphone','laptop','desktop','computer','tablet','gaming','camera','photograph','television','uhd','audio','headphone','gadget','printer','printing','projector','network','storage drive','office automation','graphics tablet','walkie'] },
  { name: 'Home Appliances', keywords: ['appliance','washer','dryer','dishwasher','fridge','freezer','fan','heater','air conditioning','vacuum','iron','sewing','kettle','microwave','food preparation','cooking','ice maker','water dispenser','water purif','geyser'] },
  { name: 'Home & Furniture', keywords: ['bedroom','bedding','rug','mat','furniture','bookshel','chair','frame','print','living room','lighting','kitchen storage','crockery','drinking glass','cookware','bakeware','basin','cabinet','shower','fireplace','decor','globe','storage'] },
  { name: 'Tools & Automotive', keywords: ['car ','car-','auto','engine','mechanic','tool','machinery','hardware','electrical','fuel','steering','fitting','cutting','hammer','vice','clamp','pump','pvc','vehicle','building'] },
  { name: 'Outdoor & Sports', keywords: ['camping','braai','playground','tree','garden','outdoor','pool','wheel sport','sport','soccer','fitness','tent','gazebo','umbrella','travel','luggage','terrain bike','water sport','cooler box'] },
  { name: 'Health, Beauty & Baby', keywords: ['health','personal care','bath time','baby','nursery','assisted living','mobility','hospital','vitamin','trimmer','face','neck','hand & body','toddler'] },
  { name: 'Food & Household', keywords: ['dairy','milk','soup','sugar','sweetener','gin','coffee','crisp','sauce','condiment','cleaning','catering','aerosol'] },
  { name: 'Office & Stationery', keywords: ['office supplies','office basics','office suite','notice board','planning','learning & development'] },
] as const;

const comparable = (value: string) => value.toLowerCase().replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim();

export const categoryGroupFor = (category: string) => {
  const value = comparable(category);
  if (['baby','nursery','toddler'].some((keyword) => value.includes(keyword))) return 'Health, Beauty & Baby';
  return CATEGORY_GROUPS.find((group) => group.keywords.some((keyword) => value.includes(keyword)))?.name || 'More Categories';
};

export const matchesCategory = (productCategory: string, selectedCategory: string) => selectedCategory === 'All'
  || productCategory === selectedCategory
  || categoryGroupFor(productCategory) === selectedCategory;

export const categorySummaries = (products: Product[]) => {
  const counts = new Map<string, number>();
  for (const product of products) {
    const group = categoryGroupFor(product.category);
    counts.set(group, (counts.get(group) || 0) + 1);
  }
  return [...CATEGORY_GROUPS.map(({ name }) => name), 'More Categories']
    .map((name) => ({ name, count: counts.get(name) || 0 }))
    .filter(({ count }) => count > 0);
};
