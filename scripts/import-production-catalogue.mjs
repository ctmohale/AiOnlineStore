import crypto from 'node:crypto';

const TARGET_COUNT = Math.min(10_000, Math.max(1, Number(process.env.TARGET_COUNT || 5_000)));
const MIN_SELLING_PRICE = Math.max(0, Number(process.env.MIN_SELLING_PRICE || 50));
const DRY_RUN = process.env.IMPORT_LIVE !== 'true';
const DIRECT_DB = process.env.IMPORT_DIRECT_DB === 'true';
const REQUEST_CONCURRENCY = Math.min(24, Math.max(1, Number(process.env.REQUEST_CONCURRENCY || 12)));
const IMPORT_CONCURRENCY = Math.min(20, Math.max(1, Number(process.env.IMPORT_CONCURRENCY || 10)));
const checkedAt = new Date();
const USER_AGENT = 'Mozilla/5.0 (compatible; MzansiMegaStore/1.0; +https://www.mzansimegastore.co.za)';

if (!DRY_RUN && (!DIRECT_DB || !process.env.DATABASE_URL)) {
  throw new Error('Live production import requires IMPORT_DIRECT_DB=true and DATABASE_URL');
}

const clean = (value, maximum = 255) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, maximum);
const price = (value) => Math.round(Number(value) * 100) / 100;
const sellingPrice = (cost, original) => original > cost ? Math.min(price(cost * 1.15), price(original) - 0.01) : price(cost * 1.05);
const sourceKey = (value) => { try { const url = new URL(value); return `${url.hostname}${url.pathname}`.toLowerCase(); } catch { return String(value || '').toLowerCase(); } };
const identityKey = (title, packSize) => `${clean(title).toLowerCase()}|${clean(packSize).toLowerCase()}`;
const decodeXml = (value) => String(value).replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');

function deliveryEstimate(category, title) {
  const text = `${category} ${title}`.toLowerCase();
  if (/fridge|freezer|washing machine|washer|dryer|dishwasher|oven|stove|television|\btv\b|furniture/.test(text)) return 250;
  if (/microwave|air fryer|heater|fan|printer|monitor|speaker/.test(text)) return 140;
  if (/cellphone|smartphone|tablet|laptop|console|camera/.test(text)) return 99;
  return 70;
}

async function fetchText(url, timeout = 30_000) {
  const response = await fetch(url, { headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
  return response.text();
}

async function parallelMap(values, limit, mapper) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      try { output[index] = await mapper(values[index], index); }
      catch (error) { output[index] = { error: error instanceof Error ? error.message : String(error) }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return output;
}

function initialState(html) {
  const match = /window\.__INITIAL_STATE__\s*=\s*/.exec(html);
  if (!match) throw new Error('Makro catalogue state was not found');
  const start = match.index + match[0].length;
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
  if (Array.isArray(value)) for (const item of value) findMakroProducts(item, products);
  else if (value && typeof value === 'object') {
    if (value.productInfo?.value?.type === 'ProductSummaryValue') products.set(value.productInfo.value.id, value.productInfo.value);
    else for (const item of Object.values(value)) findMakroProducts(item, products);
  }
  return products;
}

const makroImage = (value) => String(value || '').replace('{@width}', '1200').replace('{@height}', '1200').replace('{@quality}', '95');

function makroCandidate(product, focus) {
  const pricing = product.pricing || {};
  const current = Number(pricing.finalPrice?.value);
  const original = Number(pricing.mrp?.value);
  const title = clean(product.titles?.title, 255);
  const category = clean(product.analyticsData?.subCategory || product.analyticsData?.category || product.vertical || focus, 100);
  const brand = clean(product.productBrand || product.titles?.superTitle || title.split(' ')[0] || 'Unbranded', 120);
  const packSize = clean(product.titles?.subtitle || product.keySpecs?.find((item) => /quantity|size|capacity/i.test(item))?.split(':').slice(1).join(':') || '1 unit', 120);
  const sourceUrl = new URL(product.baseUrl || product.smartUrl, 'https://www.makro.co.za').toString();
  const imageUrl = makroImage(product.media?.images?.[0]?.url);
  if (!title || !Number.isFinite(current) || current <= 0 || !sourceUrl || !imageUrl) return null;
  const sale = Number.isFinite(original) && original > current;
  return {
    title, brand, model: clean(product.id, 120), barcode: null, packSize, category,
    description: clean(`${title}. ${product.keySpecs?.join('. ') || `Available from Makro in ${packSize}.`}`, 10_000),
    specifications: Object.fromEntries((product.keySpecs || []).slice(0, 12).map((item, index) => { const [key, ...rest] = String(item).split(':'); return [clean(key || `Specification ${index + 1}`, 100), clean(rest.join(':') || item, 500)]; })),
    sellingPrice: sellingPrice(current, sale ? original : 0), imageUrl,
    estimatedCustomerDeliveryCost: deliveryEstimate(category, title), itemWeightSize: packSize, deliveryTime: '2–5 business days after supplier confirmation',
    supplier: { retailer: 'Makro', sourceUrl, supplierSku: clean(product.id, 120), currentCost: current, originalDisplayedPrice: sale ? original : null, supplierDeliveryCost: 0, promotionStartAt: null, promotionEndAt: null, promotionEndProvided: false, promotionTerms: sale ? 'Current public Makro promotional price; end date not supplied' : '', quantityLimit: null, stockStatus: product.availability?.displayState === 'IN_STOCK' ? 'in_stock' : 'unknown', fulfilmentType: 'online_only', fulfilmentSignal: 'Current public Makro catalogue listing', sourceConfidence: 'high', supplierPriceVerified: true, lastCheckedAt: checkedAt, priceUpdatedAt: checkedAt, priceChangeReason: 'Current public Makro catalogue import' },
    focus, sale,
  };
}

async function collectMakro(target) {
  const quotas = [
    ['Baby care', 'https://www.makro.co.za/baby-care/pr?sid=kyh', 0.30],
    ['Air fryers', 'https://www.makro.co.za/air-fryers/pr?sid=j9e%2Cm38%2Cj1e', 0.18],
    ['Kitchen appliances', 'https://www.makro.co.za/home-kitchen/kitchen-appliances/pr?sid=j9e%2Cm38', 0.27],
    ['Cookware', 'https://www.makro.co.za/kitchen-cookware-serveware/cookware/pr?sid=upp%2Ctnx', 0.25],
  ];
  const plans = quotas.map(([focus, baseUrl, share]) => ({ focus: String(focus), baseUrl: String(baseUrl), desired: Math.ceil(Number(target) * Number(share)) }));
  const requests = plans.flatMap(({ focus, baseUrl, desired }) => {
    const pages = Math.ceil(desired / 40 * 1.4);
    return Array.from({ length: pages }, (_, index) => ({ focus, baseUrl, page: index + 1 }));
  });
  const pages = await parallelMap(requests, Math.min(10, REQUEST_CONCURRENCY), async ({ focus, baseUrl, page }) => {
    const url = new URL(baseUrl); url.searchParams.set('page', String(page)); url.searchParams.set('sort', 'popularity');
    const products = findMakroProducts(initialState(await fetchText(url)));
    return { focus, page, products: [...products.values()] };
  });
  const seen = new Set();
  const candidates = new Map(plans.map((plan) => [plan.focus, []]));
  const desiredByFocus = new Map(plans.map((plan) => [plan.focus, plan.desired]));
  let failedPages = 0;
  for (const page of pages) {
    if (page?.error) { failedPages++; continue; }
    for (const product of page.products) {
      const candidate = makroCandidate(product, page.focus);
      const key = candidate ? sourceKey(candidate.supplier.sourceUrl) : '';
      const bucket = candidates.get(page.focus);
      if (candidate && !seen.has(key) && bucket.length < desiredByFocus.get(page.focus)) { seen.add(key); bucket.push(candidate); }
    }
  }
  const collected = [...candidates.values()].flat();
  process.stdout.write(`Makro: ${collected.length} unique current products from ${pages.length - failedPages}/${pages.length} popularity pages (${[...candidates.entries()].map(([focus, rows]) => `${focus} ${rows.length}`).join(', ')})\n`);
  return collected.slice(0, target);
}

function findStructuredProduct(value) {
  if (Array.isArray(value)) {
    for (const item of value) { const found = findStructuredProduct(item); if (found) return found; }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  if (value['@type'] === 'Product' || (Array.isArray(value['@type']) && value['@type'].includes('Product'))) return value;
  if (value['@graph']) return findStructuredProduct(value['@graph']);
  return null;
}

function structuredProduct(html) {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const script of scripts) {
    try { const found = findStructuredProduct(JSON.parse(script[1])); if (found) return found; }
    catch { /* Ignore unrelated malformed structured data. */ }
  }
  return null;
}

function checkersPackSize(title) {
  const matches = [...String(title).matchAll(/(?:pack\s+of\s+\d+|\d+(?:[.,]\d+)?\s?(?:kg|g|mg|l|ml|cl|pieces?|pack|count|sheets?|rolls?|nappies|diapers))(?!\w)/gi)];
  return clean(matches.at(-1)?.[0] || '1 unit', 120);
}

function checkersCandidate(data, sourceUrl, focus) {
  const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers;
  const current = Number(offer?.price);
  const title = clean(data.name, 255);
  const imageUrl = Array.isArray(data.image) ? data.image[0] : data.image;
  const image = String(imageUrl || '').replace(/([?&])width=\d+/i, '$1width=1200').replace(/([?&])height=\d+/i, '$1height=1200');
  const brand = clean(typeof data.brand === 'string' ? data.brand : data.brand?.name || title.split(' ')[0] || 'Unbranded', 120);
  const sku = clean(data.sku || sourceUrl.match(/-(\d+)(?:EA)?$/i)?.[1] || crypto.randomBytes(6).toString('hex'), 120);
  const barcode = clean(data.gtin13 || data.gtin || data.gtin12 || '', 64) || null;
  const category = clean(data.category || focus, 100);
  const packSize = checkersPackSize(title);
  if (!title || !Number.isFinite(current) || current <= 0 || !image.startsWith('https://')) return null;
  const availability = String(offer?.availability || '');
  return {
    title, brand, model: sku, barcode, packSize, category,
    description: clean(data.description || `${title}. Available from Checkers.`, 10_000),
    specifications: { ...(barcode ? { Barcode: barcode } : {}), Category: category },
    sellingPrice: sellingPrice(current, 0), imageUrl: image,
    estimatedCustomerDeliveryCost: deliveryEstimate(category, title), itemWeightSize: packSize, deliveryTime: '2–5 business days after supplier confirmation',
    supplier: { retailer: 'Checkers', sourceUrl, supplierSku: sku, currentCost: current, originalDisplayedPrice: null, supplierDeliveryCost: 0, promotionStartAt: null, promotionEndAt: null, promotionEndProvided: false, promotionTerms: '', quantityLimit: null, stockStatus: /InStock$/i.test(availability) ? 'in_stock' : /OutOfStock$/i.test(availability) ? 'out_of_stock' : 'unknown', fulfilmentType: 'online_only', fulfilmentSignal: 'Current public Checkers product listing', sourceConfidence: 'high', supplierPriceVerified: true, lastCheckedAt: checkedAt, priceUpdatedAt: checkedAt, priceChangeReason: 'Current public Checkers catalogue import' },
    focus, sale: false,
  };
}

const BABY_TERMS = /baby|napp(?:y|ies)|diaper|infant|toddler|feeding|formula|stroller|pram|nursery|cot-|dummy|pacifier|teether|breast|bottle/i;
const KITCHEN_TERMS = /kitchen|cook|bake|fryer|blender|mixer|kettle|toaster|microwave|pot-|pan-|cutlery|utensil|food-storage|lunch/i;

async function collectCheckers(target) {
  const sitemapUrls = [
    'https://www.checkers.co.za/api/sitemaps/seq_product-sitemap_00.xml',
    'https://www.checkers.co.za/api/sitemaps/seq_product-sitemap_01.xml',
  ];
  const maps = await parallelMap(sitemapUrls, 2, (url) => fetchText(url, 120_000));
  const sitemapErrors = maps.filter((item) => item?.error).map((item) => item.error);
  if (sitemapErrors.length) process.stdout.write(`Checkers sitemap warnings: ${sitemapErrors.join('; ')}\n`);
  const allUrls = maps.flatMap((xml) => typeof xml === 'string' ? [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decodeXml(match[1])) : []);
  const baby = allUrls.filter((url) => BABY_TERMS.test(url));
  const kitchen = allUrls.filter((url) => KITCHEN_TERMS.test(url));
  const desiredBaby = Math.ceil(target * 0.60);
  const desiredKitchen = Math.max(0, target - desiredBaby);
  const selected = [...new Set([
    ...baby.slice(0, Math.ceil(desiredBaby * 2.5)),
    ...kitchen.slice(0, Math.ceil(desiredKitchen * 2.5)),
  ])];
  const rows = await parallelMap(selected, REQUEST_CONCURRENCY, async (url) => {
    const data = structuredProduct(await fetchText(url));
    return data ? checkersCandidate(data, url, BABY_TERMS.test(url) ? 'Baby care' : 'Kitchen') : null;
  });
  const candidates = rows.filter((row) => row && !row.error);
  const balanced = [
    ...candidates.filter((item) => item.focus === 'Baby care').slice(0, desiredBaby),
    ...candidates.filter((item) => item.focus === 'Kitchen').slice(0, desiredKitchen),
  ];
  process.stdout.write(`Checkers: ${candidates.length} current baby and kitchen products from ${selected.length} official sitemap pages\n`);
  return balanced;
}

async function gameAvailability() {
  try {
    const response = await fetch('https://www.game.co.za/occ/v2/game/channel/web/zone/G205/products/search?fields=FULL&currentPage=0', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': USER_AGENT }, body: JSON.stringify({ query: 'sale:price-desc' }), signal: AbortSignal.timeout(20_000), redirect: 'manual' });
    return { available: response.ok, status: response.status };
  } catch (error) { return { available: false, status: error instanceof Error ? error.message : String(error) }; }
}

async function loadExisting(connection) {
  const [rows] = await connection.query(`SELECT p.title,p.pack_size,o.source_url
    FROM products p LEFT JOIN supplier_offers o ON o.id=(SELECT id FROM supplier_offers WHERE product_id=p.id ORDER BY id DESC LIMIT 1)
    WHERE p.deleted_at IS NULL`);
  return {
    sources: new Set(rows.map((row) => sourceKey(row.source_url || ''))),
    identities: new Set(rows.map((row) => identityKey(row.title, row.pack_size))),
  };
}

async function insertCandidate(pool, candidate) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const slugBase = clean(`${candidate.brand}-${candidate.model}-${candidate.packSize}`, 150).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'product';
    const slug = `${slugBase}-${crypto.randomBytes(4).toString('hex')}`;
    const [result] = await connection.execute(`INSERT INTO products
      (slug,title,brand,model,barcode,pack_size,category,description,specifications,selling_price,estimated_customer_delivery_cost,delivery_time,item_weight_size,internal_review_notes,status,review_reason,gallery_checked_at,gallery_image_count)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending_review','Bulk public catalogue import requires final review',UTC_TIMESTAMP(),1)`,
    [slug, candidate.title, candidate.brand, candidate.model, candidate.barcode, candidate.packSize, candidate.category, candidate.description, JSON.stringify(candidate.specifications), candidate.sellingPrice, candidate.estimatedCustomerDeliveryCost, candidate.deliveryTime, candidate.itemWeightSize, `Imported from ${candidate.supplier.retailer}; ${candidate.focus} priority`]);
    const productId = Number(result.insertId);
    await connection.execute('INSERT INTO product_images (product_id,url,alt_text,sort_order) VALUES (?,?,?,0)', [productId, candidate.imageUrl, candidate.title]);
    const supplier = candidate.supplier;
    const [offerResult] = await connection.execute(`INSERT INTO supplier_offers
      (product_id,retailer,source_url,supplier_sku,brand,model,barcode,pack_size,current_cost,original_displayed_price,supplier_delivery_cost,promotion_start_at,promotion_end_at,promotion_end_provided,promotion_terms,quantity_limit,stock_status,fulfilment_type,fulfilment_signal,source_confidence,price_verified,last_checked_at,price_updated_at,price_change_reason)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [productId, supplier.retailer, supplier.sourceUrl, supplier.supplierSku, candidate.brand, candidate.model, candidate.barcode, candidate.packSize, supplier.currentCost, supplier.originalDisplayedPrice, supplier.supplierDeliveryCost, supplier.promotionStartAt, supplier.promotionEndAt, supplier.promotionEndProvided, supplier.promotionTerms || null, supplier.quantityLimit, supplier.stockStatus, supplier.fulfilmentType, supplier.fulfilmentSignal, supplier.sourceConfidence, supplier.supplierPriceVerified, supplier.lastCheckedAt, supplier.priceUpdatedAt, supplier.priceChangeReason]);
    await connection.execute('INSERT INTO price_history (product_id,supplier_offer_id,supplier_cost,selling_price,reason) VALUES (?,?,?,?,?)', [productId, Number(offerResult.insertId), supplier.currentCost, candidate.sellingPrice, supplier.priceChangeReason]);
    await connection.commit();
    return { created: true, productId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

async function importDirect(candidates) {
  const mysql = await import('mysql2/promise');
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: IMPORT_CONCURRENCY + 2, enableKeepAlive: true });
  try {
    const connection = await pool.getConnection();
    const existing = await loadExisting(connection);
    connection.release();
    const queue = [];
    const queuedSources = new Set();
    const queuedIdentities = new Set();
    let skippedExisting = 0;
    for (const candidate of candidates) {
      const source = sourceKey(candidate.supplier.sourceUrl);
      const identity = identityKey(candidate.title, candidate.packSize);
      if (existing.sources.has(source) || existing.identities.has(identity) || queuedSources.has(source) || queuedIdentities.has(identity)) { skippedExisting++; continue; }
      queuedSources.add(source); queuedIdentities.add(identity); queue.push(candidate);
      if (queue.length >= TARGET_COUNT) break;
    }
    if (queue.length < TARGET_COUNT) throw new Error(`Preflight found only ${queue.length} new unique products; no production records were written`);
    const [runResult] = await pool.execute("INSERT INTO ingestion_runs (adapter,status,records_seen,records_created,records_flagged,started_at) VALUES ('public-retailer-production','running',0,0,0,UTC_TIMESTAMP())");
    let created = 0;
    const failures = [];
    for (let cursor = 0; cursor < queue.length && created < TARGET_COUNT; cursor += IMPORT_CONCURRENCY) {
      const batch = queue.slice(cursor, cursor + IMPORT_CONCURRENCY);
      const results = await Promise.allSettled(batch.map((candidate) => insertCandidate(pool, candidate)));
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') created++;
        else failures.push({ title: batch[index].title, error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
      });
      if (created % 100 < IMPORT_CONCURRENCY) process.stdout.write(`Imported ${created}/${Math.min(TARGET_COUNT, queue.length)} into the production review queue\n`);
    }
    await pool.execute("UPDATE ingestion_runs SET status=?,records_seen=?,records_created=?,records_flagged=?,error_log=?,completed_at=UTC_TIMESTAMP() WHERE id=?", [created >= TARGET_COUNT ? 'completed' : 'failed', queue.length, created, failures.length, JSON.stringify(failures.slice(0, 100)), Number(runResult.insertId)]);
    return { queued: queue.length, created, skippedExisting, failures };
  } finally { await pool.end(); }
}

async function main() {
  const checkersShare = TARGET_COUNT < 100 ? Math.max(1, Math.round(TARGET_COUNT * 0.20)) : Math.max(300, Math.round(TARGET_COUNT * 0.12));
  const checkersTarget = Math.ceil(checkersShare * 1.75);
  const makroTarget = Math.ceil((TARGET_COUNT - Math.min(TARGET_COUNT, checkersShare)) * 1.75);
  const [makro, checkers, game] = await Promise.all([collectMakro(makroTarget), collectCheckers(checkersTarget), gameAvailability()]);
  const candidates = [...makro, ...checkers].filter((item) => item.sellingPrice >= MIN_SELLING_PRICE);
  const summary = {
    target: TARGET_COUNT, minimumSellingPrice: MIN_SELLING_PRICE, dryRun: DRY_RUN,
    collected: candidates.length, makro: makro.length, checkers: checkers.length,
    game: game.available ? 'available' : `not imported: public product API returned ${game.status}`,
    baby: candidates.filter((item) => item.focus === 'Baby care').length,
    airFryers: candidates.filter((item) => item.focus === 'Air fryers').length,
    kitchen: candidates.filter((item) => ['Kitchen appliances', 'Cookware', 'Kitchen'].includes(item.focus)).length,
  };
  if (DRY_RUN) { console.log(JSON.stringify(summary, null, 2)); return; }
  const imported = await importDirect(candidates);
  console.log(JSON.stringify({ ...summary, ...imported, failures: imported.failures.slice(0, 20) }, null, 2));
  if (imported.created < TARGET_COUNT) throw new Error(`Only ${imported.created}/${TARGET_COUNT} products were imported into production`);
}

main().catch((error) => { console.error(error); process.exit(1); });
