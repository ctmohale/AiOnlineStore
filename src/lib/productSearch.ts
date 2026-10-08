import type { Product } from '../data/products';

const SEARCH_ALIASES: Record<string, string[]> = {
  tv: ['television', 'smart tv', 'qled', 'oled', 'uhd'],
  phone: ['smartphone', 'mobile', 'handset', 'cellphone', 'galaxy', 'iphone', 'android'],
  cellphone: ['phone', 'smartphone', 'mobile', 'handset', 'galaxy', 'iphone', 'android'],
  smartphone: ['phone', 'cellphone', 'mobile', 'handset', 'galaxy', 'iphone', 'android'],
  fridge: ['refrigerator', 'freezer'],
  laptop: ['notebook', 'computer'],
  speaker: ['bluetooth speaker', 'soundbar', 'boombox'],
  fryer: ['air fryer', 'cooking appliance'],
  console: ['gaming console', 'playstation', 'xbox', 'nintendo'],
  washer: ['washing machine'],
  washing: ['washing machine', 'washer'],
  sofa: ['couch', 'lounge suite'],
};

const aliasesForToken = (token: string) => {
  if (SEARCH_ALIASES[token]) return SEARCH_ALIASES[token];
  const singular = token.endsWith('ies') ? `${token.slice(0, -3)}y`
    : token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1)
      : token;
  return SEARCH_ALIASES[singular] || [];
};

export const normalizeSearchText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

type SearchCandidate = {
  product: Product;
  name: string;
  brand: string;
  category: string;
  model: string;
  packSize: string;
  searchable: string;
  words: string[];
};

type ProductIntent = {
  patterns: string[];
  blockers?: string[];
  matches: (candidate: SearchCandidate) => boolean;
};

const hasPhrase = (value: string, phrase: string) => ` ${value} `.includes(` ${phrase} `);
const hasAnyPhrase = (value: string, phrases: string[]) => phrases.some((phrase) => hasPhrase(value, phrase));
const DEVICE_ACCESSORY_TERMS = ['case', 'cover', 'charger', 'cable', 'bag', 'stand', 'mount', 'bracket', 'protector', 'accessory', 'accessories', 'remote', 'table', 'desk'];

const PRODUCT_INTENTS: ProductIntent[] = [
  {
    patterns: ['mobile phone', 'mobile phones', 'phone', 'phones', 'cellphone', 'cellphones', 'smartphone', 'smartphones', 'handset', 'handsets', 'mobile', 'mobiles'],
    blockers: DEVICE_ACCESSORY_TERMS,
    matches: ({ name, category }) => {
      if (/\b(tablet|tablets|ipad|ipads|pad|pads)\b/.test(name)) return false;
      if (/\b(phone|phones|smartphone|smartphones|iphone|iphones|cellphone|cellphones)\b/.test(name)) return true;
      if (/\b(handset|handsets|cellphone|cellphones|pre owned)\b/.test(category)) return true;
      return /\bmobile devices?\b/.test(category)
        && !/\b(headphone|headphones|earbud|earbuds|watch|watches|camera|cameras|case|cover|charger|cable|speaker|speakers)\b/.test(name);
    },
  },
  {
    patterns: ['tablet computer', 'tablet computers', 'tablet', 'tablets', 'ipad', 'ipads'],
    blockers: DEVICE_ACCESSORY_TERMS,
    matches: ({ name, category }) => !/\b(vitamin|vitamins|supplement|supplements)\b/.test(category)
      && (/\b(tablet|tablets|ipad|ipads)\b/.test(name)
        || ((/\b(tab|pad)\b/.test(name) || /\bgraphics tablets?\b/.test(category))
          && /\b(handset|handsets|tablet|tablets|graphics)\b/.test(category))),
  },
  {
    patterns: ['laptop computer', 'laptop computers', 'laptop', 'laptops', 'notebook', 'notebooks', 'chromebook', 'chromebooks', 'macbook', 'macbooks'],
    blockers: DEVICE_ACCESSORY_TERMS,
    matches: ({ name, category }) => {
      if (/\b(tablet|tablets|ipad|ipads|tab|monitor|projector|desktop|mini pc|router|deco)\b/.test(name)) return false;
      if (/\btablets?\b/.test(category) && !/\b(laptop|laptops|chromebook|chromebooks|macbook|macbooks)\b/.test(name)) return false;
      if (/\b(laptop|laptops|notebook|notebooks|chromebook|chromebooks|macbook|macbooks)\b/.test(name)) return true;
      if (/\b(laptops?|refurbished)\b/.test(category)) return true;
      return /\blaptops tablets computers\b/.test(category)
        && /\b(celeron|pentium|athlon|ryzen|intel|core|ssd|ram|windows|w11|gb)\b/.test(name);
    },
  },
  {
    patterns: ['smart television', 'smart televisions', 'smart tv', 'smart tvs', 'television', 'televisions', 'tv', 'tvs'],
    blockers: ['stand', 'mount', 'bracket', 'remote', 'aerial', 'antenna', 'console', 'cabinet', 'unit'],
    matches: ({ category }) => /\b(television|televisions|uhd)\b/.test(category),
  },
  {
    patterns: ['refrigerator', 'refrigerators', 'fridge', 'fridges'],
    matches: ({ name, category }) => /\b(fridge|fridges|refrigerator|refrigerators)\b/.test(name)
      || /\bfridges\b/.test(category),
  },
  {
    patterns: ['washing machine', 'washing machines', 'laundry washer', 'laundry washers'],
    matches: ({ name, category }) => {
      if (/\b(dryer|dryers|tumble dryer|vented dryer)\b/.test(name) && !/\b(combo|washer)\b/.test(name)) return false;
      return /\b(washing machine|washing machines|w machine)\b/.test(name)
        || (/\bwashers dryers\b/.test(category) && /\b(combo|loader|washer|wash|twin tub)\b/.test(name));
    },
  },
  {
    patterns: ['washer', 'washers'],
    matches: ({ name }) => /\b(washer|washers|washing machine|washing machines|w machine)\b/.test(name),
  },
  {
    patterns: ['lounge suite', 'lounge suites', 'sofa', 'sofas', 'couch', 'couches'],
    matches: ({ name }) => /\b(sofa|sofas|couch|couches|lounge suite|lounge suites)\b/.test(name),
  },
  {
    patterns: ['disposable nappy', 'disposable nappies', 'nappy', 'nappies', 'diaper', 'diapers'],
    blockers: ['bag', 'bin', 'cream', 'rash cream', 'changing mat'],
    matches: ({ name }) => /\b(nappy|nappies|diaper|diapers)\b/.test(name),
  },
  {
    patterns: ['digital camera', 'digital cameras', 'security camera', 'security cameras', 'camera', 'cameras'],
    blockers: ['bag', 'case', 'cover', 'mount', 'tripod', 'battery'],
    matches: ({ name, category }) => !/\b(handset|handsets|cellphone|cellphones|mobile devices?|pre owned)\b/.test(category)
      && (/\b(camera|cameras)\b/.test(name) || /\b(digital cameras?|video cameras?)\b/.test(category)),
  },
  {
    patterns: ['photo printer', 'photo printers', 'printer', 'printers'],
    blockers: ['ink', 'toner', 'cartridge', 'paper', 'cable', 'stand'],
    matches: ({ name, category }) => !/\b(projectors?|laptops?)\b/.test(category)
      && (/\b(printer|printers)\b/.test(name) || /\bprinters\b/.test(category)),
  },
  {
    patterns: ['air fryer', 'air fryers', 'fryer', 'fryers'],
    matches: ({ name }) => /\b(fryer|fryers)\b/.test(name),
  },
  {
    patterns: ['baby stroller', 'baby strollers', 'stroller', 'strollers', 'pram', 'prams'],
    matches: ({ name }) => /\b(stroller|strollers|pram|prams)\b/.test(name),
  },
  {
    patterns: ['gaming console', 'gaming consoles', 'game console', 'game consoles', 'console', 'consoles'],
    blockers: ['controller', 'remote', 'steering wheel', 'stand', 'case', 'cover', 'table', 'cabinet', 'furniture'],
    matches: ({ name, brand, category }) => !/\b(furniture|audio visual accessories)\b/.test(category)
      && !/\b(furniture|cabinet|console table)\b/.test(`${name} ${brand}`)
      && /\b(console|consoles)\b/.test(name),
  },
  {
    patterns: ['playstation 5', 'ps5'],
    blockers: ['controller', 'remote', 'steering wheel', 'stand', 'case', 'cover'],
    matches: ({ name }) => /\b(ps5|playstation 5)\b/.test(name)
      && !/\b(controller|remote|steering wheel|portal)\b/.test(name),
  },
  {
    patterns: ['xbox'],
    blockers: ['controller', 'remote', 'steering wheel', 'stand', 'case', 'cover'],
    matches: ({ name }) => /\bxbox\b/.test(name)
      && !/\b(controller|remote|steering wheel)\b/.test(name),
  },
  {
    patterns: ['nintendo switch'],
    blockers: ['controller', 'remote', 'steering wheel', 'stand', 'case', 'cover'],
    matches: ({ name }) => /\bnintendo switch\b/.test(name)
      && !/\b(controller|remote|steering wheel)\b/.test(name),
  },
  {
    patterns: ['power inverter', 'power inverters', 'solar inverter', 'solar inverters', 'inverter', 'inverters'],
    matches: ({ name, category }) => /\binverters\b/.test(category)
      || (/\bcomputer accessories\b/.test(category) && /\b(inverter|power station|ups)\b/.test(name)),
  },
  {
    patterns: ['over ear headphones', 'on ear headphones', 'headphone', 'headphones', 'earphone', 'earphones'],
    blockers: ['case', 'cover', 'cable', 'stand', 'adapter'],
    matches: ({ name, category }) => !/\blaptops?\b/.test(category)
      && (/\b(headphone|headphones|earphone|earphones|airpods)\b/.test(name) || /\bheadphones\b/.test(category)),
  },
  {
    patterns: ['wireless earbuds', 'earbud', 'earbuds', 'airpod', 'airpods'],
    blockers: ['case', 'cover', 'cable', 'stand', 'adapter'],
    matches: ({ name }) => /\b(earbud|earbuds|airpod|airpods)\b/.test(name),
  },
  {
    patterns: ['smart watch', 'smart watches', 'smartwatch', 'smartwatches', 'watch', 'watches'],
    blockers: ['strap', 'band', 'charger', 'case', 'cover', 'protector'],
    matches: ({ name, category }) => !/\b(handset|handsets|cellphone|cellphones|pre owned)\b/.test(category)
      && (/\b(watch|watches|smartwatch|smartwatches)\b/.test(name) || /\bwatches\b/.test(category)),
  },
];

const findProductIntent = (query: string, tokens: string[]) => {
  const matches = PRODUCT_INTENTS.flatMap((intent) => intent.patterns.map((pattern) => ({ intent, pattern })))
    .sort((left, right) => right.pattern.length - left.pattern.length)
    .find(({ intent, pattern }) => hasPhrase(query, pattern) && !hasAnyPhrase(query, intent.blockers || []));
  if (!matches) return null;
  const patternTokens = matches.pattern.split(' ');
  const consumedIndexes = new Set<number>();
  for (let start = 0; start <= tokens.length - patternTokens.length; start += 1) {
    if (patternTokens.every((token, offset) => tokens[start + offset] === token)) {
      patternTokens.forEach((_token, offset) => consumedIndexes.add(start + offset));
      break;
    }
  }
  return { ...matches, consumedIndexes };
};

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

const wholeWordMatches = (token: string, word: string) => word === token
  || word === `${token}s`
  || word === `${token}es`
  || token === `${word}s`
  || token === `${word}es`
  || (token.endsWith('y') && word === `${token.slice(0, -1)}ies`)
  || (word.endsWith('y') && token === `${word.slice(0, -1)}ies`);

const tokenMatches = (token: string, words: string[], allowPartial = true, allowFuzzy = true) => words.some((word) => {
  if (wholeWordMatches(token, word)) return true;
  if (!allowPartial) return false;
  if (word.includes(token)) return true;
  // Keep useful singular/plural partial matches without letting tiny words match
  // longer queries (for example, the "by" in "side by side" matching "baby").
  if (word.length >= 4 && token.includes(word) && token.length - word.length <= 2) return true;
  if (!allowFuzzy || token[0] !== word[0] || token.length < 5 || word.length < 5 || Math.abs(token.length - word.length) > 2) return false;
  return editDistance(token, word) <= (token.length >= 7 ? 2 : 1);
});

export const rankProductSearch = (products: Product[], rawQuery: string, limit = 6) => {
  const query = normalizeSearchText(rawQuery);
  if (!query || limit <= 0) return [];
  const directTokens = query.split(' ').filter(Boolean);
  const aliasTokens = directTokens.flatMap(aliasesForToken).flatMap((alias) => normalizeSearchText(alias).split(' '));
  const tokens = [...new Set([...directTokens, ...aliasTokens])];
  const matchGroups = directTokens.map((token) => [
    [token],
    ...aliasesForToken(token).map((alias) => normalizeSearchText(alias).split(' ').filter(Boolean)),
  ]);
  const productIntent = findProductIntent(query, directTokens);
  const exactNameIds = new Set(products.filter((product) => normalizeSearchText(product.name) === query).map((product) => product.id));

  const candidates = products.map((product): SearchCandidate => {
    const name = normalizeSearchText(product.name);
    const brand = normalizeSearchText(product.brand);
    const category = normalizeSearchText(product.category);
    const model = normalizeSearchText(product.model);
    const packSize = normalizeSearchText(product.packSize);
    const searchable = `${name} ${brand} ${category} ${model} ${packSize}`.trim();
    const words = searchable.split(' ').filter(Boolean);
    return { product, name, brand, category, model, packSize, searchable, words };
  }).filter((candidate) => exactNameIds.has(candidate.product.id) || !productIntent || productIntent.intent.matches(candidate));
  // A misspelling is only used as a fallback when the catalogue has no direct
  // match for that typed word. This keeps partial searches such as "appli"
  // focused on appliances instead of mixing in fuzzy matches for Apple.
  const exactMatchCounts = directTokens.map((token) => candidates.filter(({ words }) => words.some((word) => wholeWordMatches(token, word))).length);
  const allowPartial = exactMatchCounts.map((count) => count < 2);
  const allowFuzzy = directTokens.map((token, index) => allowPartial[index]
    && !candidates.some(({ words }) => tokenMatches(token, words, true, false)));

  return candidates.map(({ product, name, brand, category, model, searchable, words }) => {
    const matchesEveryGroup = matchGroups.every((alternatives, groupIndex) => productIntent?.consumedIndexes.has(groupIndex) || alternatives.some((alternative, alternativeIndex) => (
      alternative.every((token) => alternativeIndex === 0
        ? tokenMatches(token, words, allowPartial[groupIndex], allowFuzzy[groupIndex])
        : tokenMatches(token, words, true, false))
      || (alternative.length > 1 && searchable.includes(alternative.join(' ')))
    )));
    if (!matchesEveryGroup) return null;

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
