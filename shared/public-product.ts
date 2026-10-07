const identifierLabel = /\b(?:product|item)\s*(?:id|code)|\b(?:sku|barcode|ean|gtin|upc|mpn|catalog(?:ue)?\s*(?:id|number)|part\s*number)\b/i;

/**
 * Removes supplier/catalogue identifiers from copy shown or sent to customers.
 * Real model names such as "55C350MN" remain intact; long standalone numeric
 * identifiers and explicitly labelled identifiers do not.
 */
export function sanitizePublicProductText(value: unknown) {
  return String(value ?? '')
    .replace(/\bCurrent public\s+[^.\n]+?\s+listing,?\s+exact item code\s+[A-Z0-9_-]+\.?/gi, '')
    .replace(/\b(?:product|item)\s*(?:id|code)\s*[:#-]?\s*[A-Z0-9_-]+\b/gi, '')
    .replace(/\b(?:sku|barcode|ean|gtin|upc|mpn|catalog(?:ue)?\s*(?:id|number)|part\s*number)\s*[:#-]?\s*[A-Z0-9_-]+\b/gi, '')
    .replace(/(^|[^\p{L}\p{N}])\d{8,}(?=$|[^\p{L}\p{N}])/gu, '$1')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/(?:\s*[,;:]\s*)+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function sanitizePublicProductName(value: unknown) {
  return sanitizePublicProductText(value) || 'Product';
}

export function publicProductSlugBase(value: unknown) {
  return sanitizePublicProductName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'product';
}

export function sanitizePublicProductSpecs(value: Record<string, string>) {
  return Object.fromEntries(Object.entries(value).flatMap(([key, rawValue]) => {
    if (identifierLabel.test(key)) return [];
    const cleanValue = sanitizePublicProductText(rawValue);
    return cleanValue ? [[key, cleanValue]] : [];
  }));
}
