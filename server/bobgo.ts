import crypto from 'node:crypto';

const productionBase = 'https://api.bobgo.co.za/v2';
const sandboxBase = 'https://api.sandbox.bobgo.co.za/v2';

export type BobGoAddress = { company?: string; streetAddress: string; localArea: string; city: string; zone: string; postalCode: string; country?: string };
export type BobGoParcel = { description?: string; lengthCm: number; widthCm: number; heightCm: number; weightKg: number; reference?: string };
export type BobGoContact = { name: string; phone: string; email: string };
export type BobGoRate = { id?: string; providerSlug: string; providerName: string; serviceLevelCode: string; serviceName: string; totalPrice: number; currency: string; raw: Record<string, unknown> };

const enabled = () => Boolean(process.env.BOBGO_API_KEY);
const baseUrl = () => process.env.BOBGO_ENVIRONMENT === 'production' ? productionBase : sandboxBase;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = process.env.BOBGO_API_KEY;
  if (!token) throw Object.assign(new Error('Bob Go is not configured'), { status: 503 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.BOBGO_TIMEOUT_MS || 15000));
  try {
    const response = await fetch(`${baseUrl()}/${path.replace(/^\//, '')}`, {
      ...options,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.arrayBuffer();
    if (!response.ok) {
      const payload = body as Record<string, unknown>;
      const message = typeof payload === 'object' && payload ? String(payload.message || payload.detail || payload.error || '') : '';
      throw Object.assign(new Error(message || `Bob Go request failed (HTTP ${response.status})`), { status: response.status, upstream: true });
    }
    return body as T;
  } finally { clearTimeout(timeout); }
}

const address = (value: BobGoAddress) => ({
  company: value.company || '',
  street_address: value.streetAddress,
  local_area: value.localArea,
  city: value.city,
  zone: value.zone,
  country: value.country || 'ZA',
  code: value.postalCode,
});
const parcel = (value: BobGoParcel) => ({
  description: value.description || 'Parcel',
  submitted_length_cm: value.lengthCm,
  submitted_width_cm: value.widthCm,
  submitted_height_cm: value.heightCm,
  submitted_weight_kg: value.weightKg,
  custom_parcel_reference: value.reference,
});

function extractRates(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (!data || typeof data !== 'object') return [];
  const body = data as Record<string, any>;
  for (const key of ['rates','data','results']) if (Array.isArray(body[key])) return body[key];
  const result: Record<string, unknown>[] = [];
  for (const provider of body.provider_rate_requests || []) {
    if (provider.status && provider.status !== 'success') continue;
    for (const rate of provider.responses || []) {
      if (rate.status && rate.status !== 'success') continue;
      result.push({ ...rate, provider_slug: rate.provider_slug || provider.provider_slug, provider_name: rate.provider_name || provider.provider_name });
    }
  }
  return result;
}

export const bobGo = {
  enabled,
  environment: () => process.env.BOBGO_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
  async verifyAccount() { return request<Record<string, unknown>>('accounts'); },
  async rates(input: { collectionAddress: BobGoAddress; deliveryAddress: BobGoAddress; collectionContact: BobGoContact; deliveryContact: BobGoContact; parcels: BobGoParcel[]; declaredValue: number }) {
    const payload = {
      collection_address: address(input.collectionAddress), delivery_address: address(input.deliveryAddress),
      collection_contact_mobile_number: input.collectionContact.phone, collection_contact_email: input.collectionContact.email, collection_contact_full_name: input.collectionContact.name,
      delivery_contact_mobile_number: input.deliveryContact.phone, delivery_contact_email: input.deliveryContact.email, delivery_contact_full_name: input.deliveryContact.name,
      parcels: input.parcels.map(parcel), declared_value: input.declaredValue, timeout: Number(process.env.BOBGO_TIMEOUT_MS || 15000),
    };
    const raw = await request<unknown>('rates', { method: 'POST', body: JSON.stringify(payload) });
    return extractRates(raw).map((rate): BobGoRate => {
      const service = (rate.service_level || {}) as Record<string, unknown>;
      return {
        id: rate.id == null ? undefined : String(rate.id),
        providerSlug: String(rate.provider_slug || ''), providerName: String(rate.provider_name || rate.courier_name || rate.provider_slug || 'Courier'),
        serviceLevelCode: String(rate.service_level_code || rate.service_code || rate.id || ''), serviceName: String(rate.service_name || service.name || rate.service_level_code || 'Delivery'),
        totalPrice: Number(rate.total_price || rate.rate || rate.rate_amount || 0), currency: String(rate.currency || 'ZAR'), raw: rate,
      };
    }).filter((rate) => rate.providerSlug && rate.serviceLevelCode && Number.isFinite(rate.totalPrice) && rate.totalPrice >= 0);
  },
  async createShipment(input: { reference: string; collectionAddress: BobGoAddress; deliveryAddress: BobGoAddress; collectionContact: BobGoContact; deliveryContact: BobGoContact; parcels: BobGoParcel[]; declaredValue: number; providerSlug: string; serviceLevelCode: string }) {
    return request<Record<string, any>>('shipments', { method: 'POST', body: JSON.stringify({
      collection_address: address(input.collectionAddress), collection_contact_name: input.collectionContact.name, collection_contact_mobile_number: input.collectionContact.phone, collection_contact_email: input.collectionContact.email,
      delivery_address: address(input.deliveryAddress), delivery_contact_name: input.deliveryContact.name, delivery_contact_mobile_number: input.deliveryContact.phone, delivery_contact_email: input.deliveryContact.email,
      parcels: input.parcels.map(parcel), declared_value: input.declaredValue, custom_tracking_reference: input.reference, custom_order_number: input.reference,
      service_level_code: input.serviceLevelCode, provider_slug: input.providerSlug, timeout: Number(process.env.BOBGO_TIMEOUT_MS || 15000),
    }) });
  },
  async tracking(trackingReference: string) { return request<Record<string, any>>(`tracking?tracking_reference=${encodeURIComponent(trackingReference)}`); },
  async waybill(trackingReferences: string[]) {
    return request<ArrayBuffer>(`shipments/waybill?tracking_references=${encodeURIComponent(JSON.stringify(trackingReferences))}`, { headers: { Accept: 'application/pdf,application/json' } });
  },
  async webhooks() { return request<unknown>('webhooks'); },
  async subscribeWebhook(topic: string, deliveryUrl: string) { return request<unknown>('webhooks', { method: 'POST', body: JSON.stringify({ topic, delivery_url: deliveryUrl, status: 'active' }) }); },
  verifyWebhook(rawBody: Buffer, signature?: string) {
    const secret = process.env.BOBGO_WEBHOOK_SECRET;
    if (!secret || !signature) return false;
    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const normalized = signature.replace(/^sha256=/i, '');
    return digest.length === normalized.length && crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(normalized));
  },
};

export const defaultParcel = (): BobGoParcel => ({
  description: 'Mzansi Mega Store parcel',
  lengthCm: Number(process.env.BOBGO_DEFAULT_LENGTH_CM || 42),
  widthCm: Number(process.env.BOBGO_DEFAULT_WIDTH_CM || 32),
  heightCm: Number(process.env.BOBGO_DEFAULT_HEIGHT_CM || 6),
  weightKg: Number(process.env.BOBGO_DEFAULT_WEIGHT_KG || 1),
});

export const collectionDetails = () => ({
  address: {
    company: process.env.BOBGO_COLLECTION_COMPANY || 'Mzansi Mega Store',
    streetAddress: process.env.BOBGO_COLLECTION_STREET || '',
    localArea: process.env.BOBGO_COLLECTION_SUBURB || '',
    city: process.env.BOBGO_COLLECTION_CITY || '',
    zone: process.env.BOBGO_COLLECTION_PROVINCE || '',
    postalCode: process.env.BOBGO_COLLECTION_POSTAL_CODE || '',
    country: 'ZA',
  } satisfies BobGoAddress,
  contact: { name: process.env.BOBGO_COLLECTION_CONTACT || 'Mzansi Mega Store', phone: process.env.BOBGO_COLLECTION_PHONE || '', email: process.env.BOBGO_COLLECTION_EMAIL || '' } satisfies BobGoContact,
});
