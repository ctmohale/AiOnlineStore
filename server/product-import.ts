const retailerHosts = new Map([
  ['game.co.za', 'Game'],
  ['www.game.co.za', 'Game'],
  ['makro.co.za', 'Makro'],
  ['www.makro.co.za', 'Makro'],
]);

export const isSupportedProductUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && retailerHosts.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
};

export const highResolutionImageUrl = (value: string) => {
  try {
    const url = new URL(value);
    if (['makro.co.za', 'www.makro.co.za'].includes(url.hostname.toLowerCase()) && url.pathname.includes('/asset/rukmini/fccp/')) {
      url.pathname = url.pathname.replace(/\/asset\/rukmini\/fccp\/\d+\/\d+\//, '/asset/rukmini/fccp/1600/1600/');
      url.searchParams.set('q', '100');
    }
    return url.toString();
  } catch { return value; }
};

const decodeText = (value: string) => value
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

const plainText = (value: unknown) => decodeText(String(value || '').replace(/<[^>]*>/g, ' '));
const numberValue = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.,-]/g, '').replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const allowedUrl = (value: string) => {
  const url = new URL(value);
  if (!isSupportedProductUrl(value)) throw Object.assign(new Error('Only public Game or Makro HTTPS product URLs are supported'), { status: 400 });
  return url;
};

async function fetchPublicHtml(initialUrl: URL) {
  let url = initialUrl;
  for (let redirect = 0; redirect < 4; redirect++) {
    const response = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'MoyaMarket/1.0 product-review-client', Accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(15_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw Object.assign(new Error('The retailer returned an invalid redirect'), { status: 422 });
      url = allowedUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw Object.assign(new Error(`The retailer page could not be read (${response.status}). Enter the details manually.`), { status: 422 });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) throw Object.assign(new Error('The supplied URL is not an HTML product page'), { status: 422 });
    const reader = response.body?.getReader();
    if (!reader) throw Object.assign(new Error('The retailer page returned no content'), { status: 422 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) { await reader.cancel(); throw Object.assign(new Error('The retailer page is too large to import safely'), { status: 422 }); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { html: new TextDecoder().decode(bytes), finalUrl: url };
  }
  throw Object.assign(new Error('The retailer URL redirected too many times'), { status: 422 });
}

const findProduct = (value: unknown): Record<string, unknown> | null => {
  if (Array.isArray(value)) {
    for (const item of value) { const found = findProduct(item); if (found) return found; }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']];
  if (types.some((type) => String(type).toLowerCase() === 'product')) return record;
  return findProduct(record['@graph']);
};

const metaValue = (html: string, key: string) => {
  for (const match of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = match[0];
    const property = tag.match(/(?:property|name)=["']([^"']+)["']/i)?.[1];
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
    if (property?.toLowerCase() === key.toLowerCase() && content) return decodeText(content);
  }
  return '';
};

const stockFromAvailability = (value: unknown) => {
  const availability = String(value || '').toLowerCase();
  if (availability.includes('instock')) return 'in_stock';
  if (availability.includes('limited') || availability.includes('lowstock')) return 'low_stock';
  if (availability.includes('outofstock') || availability.includes('soldout')) return 'out_of_stock';
  return 'unknown';
};

const stockFromPage = (html: string) => {
  const visibleText = plainText(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' '));
  const productText = visibleText.split(/Similar Products|Bought Together/i)[0];
  if (/hurry,?\s*only\s*(?:\d+|a few)\s*left|only\s*\d+\s*left in stock/i.test(productText)) return 'low_stock';
  if (/out of stock/i.test(productText)) return 'out_of_stock';
  if (/available online only/i.test(productText) || /add to cart/i.test(productText)) return 'in_stock';
  return 'unknown';
};

const fulfilmentFromPage = (html: string) => {
  const visibleText = plainText(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' '));
  const productText = visibleText.split(/Similar Products|Bought Together/i)[0];
  if (/available\s*online\s*only|online\s*only|delivery\s*only/i.test(productText)) return { type: 'online_only', signal: 'The supplier listing says this item is online only.' };
  if (/click\s*(?:and|&)\s*collect|collect\s*(?:in|from)\s*store|available\s*in[- ]store/i.test(productText)) return { type: 'store_stock', signal: 'The supplier listing indicates store collection or in-store availability.' };
  if (/warehouse|dispatch(?:ed)?\s*from/i.test(productText)) return { type: 'warehouse', signal: 'The supplier listing indicates warehouse fulfilment.' };
  return { type: 'unknown', signal: 'No explicit fulfilment method was found on the supplier listing.' };
};

const imageValues = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(imageValues);
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [record.url, record.contentUrl, record.thumbnailUrl].flatMap(imageValues);
};

const pageProductImages = (html: string) => {
  const productSection = html.split(/Similar Products|You may also like|Recommended for you|Bought Together/i)[0]
    .replace(/\\u002f/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  const matches = productSection.match(/https:\/\/[^\s"'<>]+?\.(?:jpe?g|png|webp)(?:\?[^\s"'<>]*)?/gi) || [];
  return matches.filter((value) => {
    const lower = value.toLowerCase();
    return !/(?:logo|favicon|icon|sprite|banner|placeholder|payment|badge)/.test(lower)
      && /(?:asset|image|product|catalog|media|cdn)/.test(lower);
  });
};

export async function importProductUrl(rawUrl: string) {
  const requestedUrl = allowedUrl(rawUrl);
  const { html, finalUrl } = await fetchPublicHtml(requestedUrl);
  let product: Record<string, unknown> | null = null;
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { product = findProduct(JSON.parse(decodeText(match[1]))); if (product) break; } catch { /* malformed retailer metadata; try the next block */ }
  }
  const offerValue = Array.isArray(product?.offers) ? product?.offers[0] : product?.offers;
  const offer = offerValue && typeof offerValue === 'object' ? offerValue as Record<string, unknown> : {};
  const brandValue = product?.brand;
  const brand = typeof brandValue === 'object' && brandValue ? String((brandValue as Record<string, unknown>).name || '') : String(brandValue || '');
  const imageUrls = [...new Set([...imageValues(product?.image), metaValue(html, 'og:image'), ...pageProductImages(html)]
    .map((value) => highResolutionImageUrl(String(value || '')))
    .filter((value) => value.startsWith('https://'))) ].slice(0, 20);
  const title = plainText(product?.name || metaValue(html, 'og:title'));
  const description = plainText(product?.description || metaValue(html, 'og:description'));
  const imageUrl = imageUrls[0] || '';
  const price = numberValue(offer.price ?? offer.lowPrice ?? product?.price ?? metaValue(html, 'product:price:amount'));
  const model = plainText(product?.model || product?.mpn || product?.sku || '');
  const sku = plainText(product?.sku || '');
  const barcode = plainText(product?.gtin13 || product?.gtin14 || product?.gtin12 || '');
  const extracted = Boolean(product || title || price);
  if (!extracted) throw Object.assign(new Error('No public product metadata was found. Enter the details manually and verify them against the listing.'), { status: 422 });
  const fulfilment = fulfilmentFromPage(html);
  return {
    title, category: plainText(product?.category || 'Uncategorised'), brand, model, barcode, packSize: '1 unit', description,
    imageUrl, imageUrls, retailer: retailerHosts.get(finalUrl.hostname.toLowerCase()) || '', sourceUrl: finalUrl.toString(), supplierSku: sku,
    currentCost: price, originalDisplayedPrice: null, stockStatus: stockFromAvailability(offer.availability) === 'unknown' ? stockFromPage(html) : stockFromAvailability(offer.availability), lastCheckedAt: new Date().toISOString(),
    fulfilmentType: fulfilment.type, fulfilmentSignal: fulfilment.signal,
    promotionStartAt: null, promotionEndAt: null, promotionTerms: '', quantityLimit: '', supplierDeliveryCost: 0,
    sourceConfidence: product ? 'high' : 'medium', supplierPriceVerified: false, priceUpdatedAt: price ? new Date().toISOString() : null,
    priceChangeReason: 'Initial URL import', reviewNotes: 'Imported from public retailer metadata. Verify the exact model, pack size, stock and checkout price before publishing.',
    importWarning: 'Imported fields are a review draft. The retailer remains the source of truth and no access controls were bypassed.',
  };
}
