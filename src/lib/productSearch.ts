import type { Product } from '../data/products';

const SEARCH_ALIASES: Record<string, string[]> = {
  tv: ['television', 'smart tv', 'qled', 'oled', 'uhd'],
  phone: ['smartphone', 'mobile', 'handset', 'galaxy', 'iphone'],
  cellphone: ['smartphone', 'mobile', 'handset'],
  fridge: ['refrigerator', 'freezer'],
  laptop: ['notebook', 'computer'],
  speaker: ['bluetooth speaker', 'soundbar', 'boombox'],
  fryer: ['air fryer', 'cooking appliance'],
  console: ['gaming console', 'playstation', 'xbox', 'nintendo'],
  washer: ['washing machine'],
  washing: ['washing machine', 'washer'],
  sofa: ['couch', 'lounge suite'],
};

export const normalizeSearchText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const editDistance = (left: string, right: string) => {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const previous = row[rightIndex];
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return row[right.length];
};

const tokenMatches = (token: string, words: string[]) => words.some((word) => {
  if (word.includes(token) || token.includes(word)) return true;
  if (token.length < 4 || word.length < 4 || Math.abs(token.length - word.length) > 2) return false;
  return editDistance(token, word) <= (token.length >= 7 ? 2 : 1);
});

export const rankProductSearch = (products: Product[], rawQuery: string, limit = 6) => {
  const query = normalizeSearchText(rawQuery);
  if (!query || limit <= 0) return [];
  const directTokens = query.split(' ').filter(Boolean);
  const aliasTokens = directTokens.flatMap((token) => SEARCH_ALIASES[token] || []).flatMap((alias) => normalizeSearchText(alias).split(' '));
  const tokens = [...new Set([...directTokens, ...aliasTokens])];
  const matchGroups = directTokens.map((token) => [token, ...(SEARCH_ALIASES[token] || []).flatMap((alias) => normalizeSearchText(alias).split(' '))]);

  return products.map((product) => {
    const name = normalizeSearchText(product.name);
    const brand = normalizeSearchText(product.brand);
    const category = normalizeSearchText(product.category);
    const model = normalizeSearchText(product.model);
    const packSize = normalizeSearchText(product.packSize);
    const searchable = `${name} ${brand} ${category} ${model} ${packSize}`.trim();
    const words = searchable.split(' ').filter(Boolean);
    if (!matchGroups.every((group) => group.some((token) => tokenMatches(token, words)))) return null;

    let score = 0;
    if (name === query) score += 1200;
    else if (name.startsWith(query)) score += 850;
    else if (name.includes(query)) score += 650;
    if (brand === query) score += 700;
    else if (brand.startsWith(query)) score += 420;
    if (category === query) score += 560;
    else if (category.includes(query)) score += 260;
    for (const token of tokens) {
      if (name.split(' ').some((word) => word.startsWith(token))) score += 90;
      else if (name.includes(token)) score += 55;
      if (brand.includes(token)) score += 45;
      if (category.includes(token)) score += 35;
      if (model.includes(token)) score += 25;
    }
    score += Math.min(Number(product.trendingUnits || 0), 20) * 4;
    score += Math.min(Number(product.recentUnits || 0), 20) * 2;
    score += Math.min(Number(product.unitsSold || 0), 100) * .1;
    return { product, score };
  }).filter((result): result is { product: Product; score: number } => Boolean(result))
    .sort((left, right) => right.score - left.score || left.product.price - right.product.price || left.product.id - right.product.id)
    .slice(0, limit)
    .map(({ product }) => product);
};

export const matchesProductSearch = (product: Product, query: string) => !normalizeSearchText(query)
  || rankProductSearch([product], query, 1).length === 1;
