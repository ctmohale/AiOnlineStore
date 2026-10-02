import type { Product } from '../data/products';

export const productSale = (product: Product, now = Date.now()) => {
  if (!Number.isFinite(product.price) || product.price <= 0 || !product.compareAt || !Number.isFinite(product.compareAt) || product.compareAt <= product.price) return null;
  const start = product.promotionStartAt ? Date.parse(product.promotionStartAt) : null;
  const end = product.promotionEndAt ? Date.parse(product.promotionEndAt) : null;
  if ((start !== null && (!Number.isFinite(start) || start > now)) || (end !== null && (!Number.isFinite(end) || end <= now))) return null;
  const percent = Math.floor((product.compareAt - product.price) / product.compareAt * 100);
  if (percent < 2) return null;
  return {
    discountLabel: `${percent}%`,
    endLabel: end === null ? null : `Sale ends ${new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' }).format(end)} SAST`,
  };
};
