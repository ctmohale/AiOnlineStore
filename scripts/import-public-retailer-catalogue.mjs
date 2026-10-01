const API_URL = process.env.MZANSI_MEGA_STORE_API_URL || 'https://api-production-093e2.up.railway.app/api';
const ADMIN_EMAIL = process.env.MZANSI_MEGA_STORE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.MZANSI_MEGA_STORE_ADMIN_PASSWORD;
const TARGET_COUNT = Math.min(500, Math.max(1, Number(process.env.TARGET_COUNT || 500)));
const MIN_SELLING_PRICE = Math.max(0, Number(process.env.MIN_SELLING_PRICE || 200));
const DRY_RUN = process.env.IMPORT_LIVE !== 'true';
const checkedAt = new Date().toISOString();

if (!DRY_RUN && (!ADMIN_EMAIL || !ADMIN_PASSWORD)) throw new Error('MZANSI_MEGA_STORE_ADMIN_EMAIL and MZANSI_MEGA_STORE_ADMIN_PASSWORD are required for a live import');

function initialState(html) {
  const marker = 'window.__INITIAL_STATE__ = ';
  const start = html.indexOf(marker) + marker.length;
  if (start < marker.length) throw new Error('Makro catalogue state was not found');
  let depth = 0, inString = false, escaped = false;
  for (let index = start; index < html.length; index++) {
    const character = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth++;
    else if (character === '}' && --depth === 0) return JSON.parse(html.slice(start, index + 1));
  }
  throw new Error('Makro catalogue state was incomplete');
}

function findMakroProducts(value, products = new Map()) {
  if (Array.isArray(value)) {
    for (const item of value) findMakroProducts(item, products);
  } else if (value && typeof value === 'object') {
    if (value.productInfo?.value?.type === 'ProductSummaryValue') {
      const product = value.productInfo.value;
      products.set(product.id, product);
    } else for (const item of Object.values(value)) findMakroProducts(item, products);
  }
  return products;
}

const clean = (value, maximum = 255) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, maximum);
const price = (value) => Math.round(Number(value) * 100) / 100;
const sellingPrice = (cost, original) => original > cost ? Math.min(price(cost * 1.15), price(original) - 0.01) : price(cost * 1.07);
const makroImage = (value) => String(value || '').replace('{@width}', '1000').replace('{@height}', '1000').replace('{@quality}', '95');
const sourceKey = (value) => { try { const url = new URL(value); return `${url.hostname}${url.pathname}`.toLowerCase(); } catch { return value.toLowerCase(); } };

function deliveryEstimate(category, title) {
  const text = `${category} ${title}`.toLowerCase();
  if (/fridge|freezer|washing machine|washer|dryer|dishwasher|oven|stove|television|\btv\b|furniture/.test(text)) return 250;
  if (/microwave|air fryer|heater|fan|printer|monitor|speaker/.test(text)) return 140;
  if (/cellphone|smartphone|tablet|laptop|console|camera/.test(text)) return 99;
  return 70;
}

function makroCandidate(product) {
  const pricing = product.pricing || {};
  const current = Number(pricing.finalPrice?.value);
  const original = Number(pricing.mrp?.value);
  const title = clean(product.titles?.title, 255);
  const category = clean(product.analyticsData?.subCategory || product.analyticsData?.category || product.vertical || 'General', 100);
  const brand = clean(product.productBrand || product.titles?.superTitle || 'Unbranded', 120);
  const packSize = clean(product.titles?.subtitle || product.keySpecs?.find((item) => /quantity|size|capacity/i.test(item))?.split(':').slice(1).join(':') || '1 unit', 120);
  const sourceUrl = new URL(product.baseUrl || product.smartUrl, 'https://www.makro.co.za').toString();
  const imageUrl = makroImage(product.media?.images?.[0]?.url);
  if (!title || !current || !sourceUrl || !imageUrl) return null;
  const sale = original > current;
  return {
    title, brand, model: clean(product.id, 120), packSize, category,
    description: clean(`${title}. ${product.keySpecs?.join('. ') || `Available from Makro in ${packSize}.`}`, 10000),
    specifications: Object.fromEntries((product.keySpecs || []).slice(0, 12).map((item, index) => { const [key, ...rest] = String(item).split(':'); return [clean(key || `Specification ${index + 1}`, 100), clean(rest.join(':') || item, 500)]; })),
    sellingPrice: sellingPrice(current, sale ? original : 0), imageUrl,
    estimatedCustomerDeliveryCost: deliveryEstimate(category, title), itemWeightSize: packSize, deliveryTime: '2–5 business days after supplier confirmation',
    supplier: { retailer: 'Makro', sourceUrl, supplierSku: clean(product.id, 120), currentCost: current, originalDisplayedPrice: sale ? original : null, supplierDeliveryCost: 0, promotionEndProvided: false, stockStatus: product.availability?.displayState === 'IN_STOCK' ? 'in_stock' : 'unknown', sourceConfidence: 'high', supplierPriceVerified: true, lastCheckedAt: checkedAt, priceUpdatedAt: checkedAt, priceChangeReason: 'Public Makro catalogue import' },
    status: 'published', reviewNotes: 'Imported from current public Makro catalogue data; recheck source before fulfilment.', sale,
  };
}

async function collectMakro() {
  const candidates = new Map();
  const catalogues = [
    ['Clearance', 'https://www.makro.co.za/all/~cs-w2553hzh8d/pr?sid=all&sort=price_desc', 10],
    ['Home appliances', 'https://www.makro.co.za/home-kitchen/home-appliances/pr?sid=j9e,abm', 8],
    ['Laptops', 'https://www.makro.co.za/all/computers/laptops/pr?sid=all,6bo,b5g', 5],
    ['Mobile phones', 'https://www.makro.co.za/all/mobiles-accessories/mobiles/pr?sid=all,tyy,4io', 5],
    ['Speakers', 'https://www.makro.co.za/all/audio-video/speakers/pr?sid=all,0pm,0o7', 5],
    ['Gaming', 'https://www.makro.co.za/gaming/gaming-consoles/pr?sid=4rr,x1m', 5],
    ['Cameras', 'https://www.makro.co.za/all/cameras-accessories/cameras/pr?sid=all,jek,p31', 5],
    ['Kitchen', 'https://www.makro.co.za/kitchen-cookware-serveware/pr?sid=upp', 5],
    ['Camping', 'https://www.makro.co.za/all/~cs-96c93fy581/pr?sid=all', 5],
  ];
  const requests = catalogues.flatMap(([name, baseUrl, count]) => Array.from({ length: Number(count) }, (_, index) => ({ name, baseUrl, page: index + 1 })));
  const pages = await parallelMap(requests, 6, async ({ name, baseUrl, page }) => {
    const url = new URL(String(baseUrl)); url.searchParams.set('page', String(page));
    const response = await fetch(url, { headers: { 'User-Agent': 'MzansiMegaStore/1.0 product-review-client' } });
    if (!response.ok) throw new Error(`Makro ${name} page ${page} returned ${response.status}`);
    return { name, page, products: findMakroProducts(initialState(await response.text())) };
  });
  for (const { name, page, products } of pages) {
    for (const product of products.values()) {
      const candidate = makroCandidate(product);
      if (candidate) candidates.set(sourceKey(candidate.supplier.sourceUrl), candidate);
    }
    process.stdout.write(`Makro ${name} page ${page}: ${candidates.size} unique products\n`);
  }
  return [...candidates.values()];
}

async function gameRequest(path, options = {}) {
  const response = await fetch(`https://www.game.co.za${path}`, { ...options, headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'MzansiMegaStore/1.0 product-review-client', ...options.headers } });
  if (!response.ok) throw new Error(`Game request returned ${response.status}`);
  return response.json();
}

async function parallelMap(values, limit, mapper) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() { while (cursor < values.length) { const index = cursor++; output[index] = await mapper(values[index], index); } }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return output;
}

function gameCandidate(product) {
  const current = Number(product.price?.value);
  const original = Number(product.mrp?.value);
  const title = clean(product.name, 255);
  const category = clean(product.categoryL2 || product.categoryL1 || 'General', 100);
  const brand = clean(product.brand || title.split(' ')[0] || 'Unbranded', 120);
  const packSize = clean(product.unitCode === 'EA' ? '1 unit' : product.unitCode || '1 unit', 120);
  const sourceUrl = new URL(product.url, 'https://www.game.co.za').toString();
  const imageUrl = product.image?.url || product.images?.find((item) => item.format === 'product')?.url;
  if (!title || !current || !sourceUrl || !imageUrl) return null;
  const sale = original > current;
  const promotionEndAt = product.price?.endDate && sale ? new Date(`${product.price.endDate} 23:59:59 GMT+0200`).toISOString() : null;
  return {
    title, brand, model: clean(product.mpn || product.code, 120), barcode: clean(product.ean || '', 64) || null, packSize, category,
    description: clean(`${title}. Current public Game listing, exact item code ${product.code}.`, 10000),
    specifications: Object.fromEntries((product.classifications || []).flatMap((group) => group.features || []).slice(0, 12).map((feature, index) => [clean(feature.name || `Specification ${index + 1}`, 100), clean(feature.featureValues?.map((item) => item.value).join(', ') || '', 500)])),
    sellingPrice: sellingPrice(current, sale ? original : 0), imageUrl,
    estimatedCustomerDeliveryCost: deliveryEstimate(category, title), itemWeightSize: packSize, deliveryTime: '2–5 business days after supplier confirmation',
    supplier: { retailer: 'Game', sourceUrl, supplierSku: clean(product.code, 120), currentCost: current, originalDisplayedPrice: sale ? original : null, supplierDeliveryCost: 0, promotionStartAt: null, promotionEndAt, promotionEndProvided: Boolean(promotionEndAt), promotionTerms: sale ? 'Public Game promotional price' : '', stockStatus: product.stock?.stockLevelStatus === 'inStock' || Number(product.stock?.stockLevel) > 0 ? (Number(product.stock?.stockLevel) > 0 && Number(product.stock.stockLevel) <= 3 ? 'low_stock' : 'in_stock') : 'out_of_stock', sourceConfidence: 'high', supplierPriceVerified: true, lastCheckedAt: checkedAt, priceUpdatedAt: checkedAt, priceChangeReason: 'Public Game catalogue import' },
    status: 'published', reviewNotes: 'Imported from current public Game catalogue data; recheck source before fulfilment.', sale,
  };
}

async function collectGame() {
  const pages = await parallelMap(Array.from({ length: 120 }, (_, index) => index), 10, (page) => gameRequest(`/occ/v2/game/channel/web/zone/G205/products/search?fields=FULL&currentPage=${page}`, { method: 'POST', body: JSON.stringify({ query: 'sale:price-desc' }) }));
  const products = new Map();
  for (const page of pages) for (const product of page.products || []) products.set(product.code, product);
  return [...products.values()].map(gameCandidate).filter(Boolean);
}

async function login() {
  const response = await fetch(`${API_URL}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Administrator login failed');
  return body.token;
}

async function adminRequest(token, path, options = {}) {
  const response = await fetch(`${API_URL}/admin${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } });
  const body = response.status === 204 ? null : await response.json();
  return { ok: response.ok, status: response.status, body };
}

async function main() {
  const [makro, game] = await Promise.all([collectMakro(), process.env.SKIP_GAME === 'true' ? [] : collectGame()]);
  const candidates = [...game, ...makro].filter((item) => item.sellingPrice >= MIN_SELLING_PRICE).sort((a, b) => Number(b.sale) - Number(a.sale) || b.sellingPrice - a.sellingPrice);
  const summary = { collected: candidates.length, sale: candidates.filter((item) => item.sale).length, game: game.length, makro: makro.length, minimumSellingPrice: MIN_SELLING_PRICE, target: TARGET_COUNT, dryRun: DRY_RUN };
  if (DRY_RUN) { console.log(JSON.stringify(summary, null, 2)); return; }

  const token = await login();
  const existingResponse = await adminRequest(token, '/products');
  if (!existingResponse.ok) throw new Error(existingResponse.body?.error || 'Existing products could not be loaded');
  const existingSources = new Set(existingResponse.body.map((item) => sourceKey(item.source_url || '')));
  const existingIdentity = new Set(existingResponse.body.map((item) => `${clean(item.title).toLowerCase()}|${clean(item.pack_size).toLowerCase()}`));
  const queue = candidates.filter((item) => !existingSources.has(sourceKey(item.supplier.sourceUrl)) && !existingIdentity.has(`${item.title.toLowerCase()}|${item.packSize.toLowerCase()}`));
  let created = 0, published = 0, held = 0, skipped = 0, cursor = 0;
  const failures = [];
  while (created < TARGET_COUNT && cursor < queue.length) {
    const batch = queue.slice(cursor, cursor + Math.min(32, TARGET_COUNT - created));
    cursor += batch.length;
    const results = await parallelMap(batch, 32, async (candidate) => {
      const { sale, ...payload } = candidate;
      let response = await adminRequest(token, '/products', { method: 'POST', body: JSON.stringify(payload) });
      if (!response.ok && response.status === 422) response = await adminRequest(token, '/products', { method: 'POST', body: JSON.stringify({ ...payload, status: 'pending_review' }) });
      return { candidate, response };
    });
    for (const { candidate, response } of results) {
      if (response.ok) { created++; if (response.body.status === 'published') published++; else held++; }
      else if (response.status === 409) skipped++;
      else failures.push({ title: candidate.title, status: response.status, error: response.body?.error || 'Unknown error' });
    }
    process.stdout.write(`Imported ${created}/${TARGET_COUNT} (${published} live, ${held} review)\n`);
  }
  if (created < TARGET_COUNT) throw new Error(`Only ${created} products were imported; ${failures.length} failed and ${skipped} were duplicates`);
  console.log(JSON.stringify({ ...summary, created, published, held, skipped, failures: failures.slice(0, 20) }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
