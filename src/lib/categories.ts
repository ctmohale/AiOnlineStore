import type { Product } from '../data/products';

export const CATEGORY_GROUPS = [
  { name: 'Electronics & Computing', keywords: ['handset','mobile device','mobile phone','cellphone','smartphone','iphone','galaxy','laptop','notebook','desktop','computer','mini pc','tablet','gaming','camera','photograph','television','uhd','audio','headphone','gadget','printer','printing','projector','network','storage drive','office automation','graphics tablet','walkie','bluetooth','monitor','electronic security','access security','smart door lock','security camera','photo booth','musical instrument','digital piano','portable keyboard'] },
  { name: 'Home Appliances', keywords: ['appliance','washer','dryer','dishwasher','fridge','freezer','fan','heater','heating cooling','air conditioning','aircon','vacuum','floor care','iron','sewing','kettle','microwave','food preparation','cooking appliance','ice maker','water dispenser','water purif','geyser'] },
  { name: 'Home & Furniture', keywords: ['bedroom','bedding','rug','mat','furniture','bookshel','chair','frame','print','living room','lighting','kitchen storage','kitchen accessories','kitchen preparation','crockery','drinking glass','cookware','frying pan','wok','bakeware','ice cube tray','basin','cabinet','shower','fireplace','decor','globe','storage','mixer faucet','bath mixer','spout'] },
  { name: 'Tools & Automotive', keywords: ['car ','car-','auto','engine','mechanic','tool','machinery','hardware','electrical','fuel','steering','fitting','cutting','hammer','vice','clamp','pump','pvc','vehicle','building','generator','inverter','renewable energy','solar panel','power station','trolley','marking stamp'] },
  { name: 'Outdoor & Sports', keywords: ['camping','braai','playground','tree','garden','outdoor','pool','wheel sport','sport','soccer','fitness','tent','gazebo','umbrella','travel','luggage','terrain bike','water sport','cooler box','binocular','telescope','spotting scope'] },
  { name: 'Health, Beauty & Baby', keywords: ['health','personal care','bath time','baby','nursery','assisted living','mobility','hospital','vitamin','trimmer','face','neck','hand & body','toddler','jewellery','watch'] },
  { name: 'Food & Household', keywords: ['dairy','milk','soup','sugar','sweetener','gin','coffee','crisp','sauce','condiment','cleaning','catering','aerosol','beverage','soft drink','coca cola','stoney','juice blend'] },
  { name: 'Office & Stationery', keywords: ['office supplies','office basics','office suite','notice board','planning','learning & development','stamp set','alphabetical','stationery'] },
] as const;

export const CATEGORY_NAMES = CATEGORY_GROUPS.map(({ name }) => name);

export const FOCUSED_CATEGORIES = [
  { name: 'Phones & Tablets', image: '/category-phones.png', description: 'Smartphones, tablets & accessories', keywords: ['smartphone', 'cellphone', 'mobile phone', 'handset', 'iphone', 'tablet'] },
  { name: 'Kitchen & Dining', image: '/category-kitchen.png', description: 'Cookware, tableware & kitchen essentials', keywords: ['cookware', 'frying pan', 'wok', 'bakeware', 'crockery', 'cutlery', 'dinnerware', 'drinking glass', 'kitchen accessories', 'kitchen storage', 'kitchen preparation'] },
  { name: 'Baby & Nursery', image: '/category-baby.png', description: 'Baby care, travel & nursery essentials', keywords: ['baby', 'nursery', 'toddler', 'stroller', 'pram', 'cot'] },
  { name: 'Solar & Backup Power', image: '/category-power.png', description: 'Inverters, solar & portable power', keywords: ['inverter', 'solar panel', 'power station', 'generator', 'renewable energy', 'ups'] },
] as const;

const comparable = (value: string) => value.toLowerCase().replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim();

export const categoryGroupFor = (category: string, productDetails = '') => {
  const value = comparable(`${category} ${productDetails}`);
  if (['baby','nursery','toddler'].some((keyword) => value.includes(keyword))) return 'Health, Beauty & Baby';
  return CATEGORY_GROUPS.find((group) => group.keywords.some((keyword) => value.includes(keyword)))?.name || 'Home & Furniture';
};

const matchesFocusedCategory = (category: string, selected: string, details: string) => {
  const group = FOCUSED_CATEGORIES.find(({ name }) => name === selected);
  const value = ` ${comparable(`${category} ${details}`)} `;
  return Boolean(group?.keywords.some((keyword) => value.includes(` ${keyword} `)));
};

export const matchesCategory = (productCategory: string, selectedCategory: string, productDetails = '') => selectedCategory === 'All'
  || productCategory === selectedCategory
  || categoryGroupFor(productCategory, productDetails) === selectedCategory
  || matchesFocusedCategory(productCategory, selectedCategory, productDetails);

export const categorySummaries = (products: Product[]) => {
  const counts = new Map<string, number>();
  for (const product of products) {
    const group = categoryGroupFor(product.category, `${product.name} ${product.brand} ${product.model}`);
    counts.set(group, (counts.get(group) || 0) + 1);
  }
  return [...CATEGORY_NAMES
    .map((name) => ({ name, count: counts.get(name) || 0 }))
    .filter(({ count }) => count > 0),
    ...FOCUSED_CATEGORIES.map(({ name }) => ({ name, count: products.filter((product) => matchesFocusedCategory(product.category, name, `${product.name} ${product.brand} ${product.model}`)).length })).filter(({ count }) => count > 0),
  ];
};
