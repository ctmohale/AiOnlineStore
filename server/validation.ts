import { z } from 'zod';

export const orderSchema = z.object({
  testMode: z.boolean().optional().default(false),
  customer: z.object({
    name: z.string().trim().min(2).max(160),
    email: z.email().max(190),
    phone: z.string().trim().regex(/^[0-9+ ]{9,15}$/),
    addressLine1: z.string().trim().min(4).max(255),
    suburb: z.string().trim().min(2).max(120),
    city: z.string().trim().min(2).max(120),
    province: z.enum(['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape']),
    postalCode: z.string().regex(/^\d{4}$/),
    notes: z.string().trim().max(2000).optional(),
  }),
  items: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(20), agreedUnitPrice: z.number().positive().optional() })).min(1).max(25),
});

export const quoteSchema = z.object({
  supplierProductCost: z.number().nonnegative(), supplierDelivery: z.number().nonnegative(), customerDeliveryCost: z.number().nonnegative(), packagingCost: z.number().nonnegative(), paymentFeeEstimate: z.number().nonnegative(), advertisingCost: z.number().nonnegative(), customerDeliveryCharged: z.number().nonnegative(), desiredProfit: z.number().nonnegative().optional(),
});

export const paymentLinkSchema = z.object({
  provider: z.enum(['yoco', 'paystack', 'other']), paymentLink: z.url().max(1500), externalReference: z.string().trim().min(2).max(255),
});

export const productReviewSchema = z.object({
  status: z.enum(['draft', 'pending_review', 'published', 'paused', 'unavailable']),
  sellingPrice: z.number().positive(),
  reviewReason: z.string().trim().max(255).nullable().optional(),
  supplierDelivery: z.number().nonnegative().default(0),
  customerDeliveryCost: z.number().nonnegative().default(0),
  packaging: z.number().nonnegative().default(0),
  paymentFees: z.number().nonnegative().default(0),
  advertisingCost: z.number().nonnegative().default(0),
});

export const pricingSettingsSchema = z.object({
  minimumProfit: z.number().nonnegative(), minimumMarginPercent: z.number().min(0).max(100), standardMarkupPercent: z.number().min(5).max(10), freeDeliveryThreshold: z.number().nonnegative(), standardCustomerDelivery: z.number().nonnegative(), supplierStaleHours: z.number().int().min(1).max(168),
});

export const orderStatusSchema = z.object({
  status: z.enum(['requested','checking_supplier','quoted','awaiting_payment','paid','purchasing','shipped','delivered','cancelled','refunded']),
  courierName: z.string().trim().min(2).max(120).optional(),
  trackingNumber: z.string().trim().min(2).max(160).optional(),
  trackingUrl: z.url().max(1500).refine((value) => value.startsWith('https://'), 'Use an HTTPS tracking link').optional(),
}).superRefine((value, context) => {
  if (value.status === 'shipped' && (!value.courierName || !value.trackingNumber)) context.addIssue({ code: 'custom', message: 'Courier and tracking number are required when shipping' });
});

export const paymentConfirmationSchema = z.object({ externalReference: z.string().trim().min(2).max(255) });

export const customerRegisterSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.email().max(190),
  phone: z.string().trim().regex(/^[0-9+ ]{9,15}$/).optional(),
  password: z.string().min(10).max(128),
});

export const customerLoginSchema = z.object({ email: z.email().max(190), password: z.string().min(1).max(128) });

const customerPhoneSchema = z.preprocess(
  (value) => value === '' ? null : value,
  z.string().trim().regex(/^[0-9+ ]{9,15}$/).nullable().optional(),
);

export const customerProfileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.email().max(190),
  phone: customerPhoneSchema,
});

export const customerPasswordUpdateSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(10).max(128),
}).refine((value) => value.currentPassword !== value.newPassword, { message: 'Choose a password different from your current password', path: ['newPassword'] });

export const adminPasswordUpdateSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
}).refine((value) => value.currentPassword !== value.newPassword, { message: 'Choose a password different from your current password', path: ['newPassword'] });

export const adminCustomerUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.email().max(190),
  phone: customerPhoneSchema,
  newPassword: z.union([z.string().min(10).max(128), z.literal('')]).optional(),
});

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalMoney = z.number().nonnegative().max(10_000_000).nullable().optional();
const optionalDate = z.preprocess((value) => value === '' || value === null ? null : value, z.coerce.date().nullable()).optional();

export const orderFulfilmentSchema = z.object({
  supplierOrderReference: z.string().trim().max(190).nullable().optional(),
  supplierOrderUrl: z.union([z.url().max(1500), z.literal(''), z.null()]).optional(),
  fulfilmentNotes: z.string().trim().max(5000).nullable().optional(),
  expectedShipAt: optionalDate,
  expectedDeliveryAt: optionalDate,
  actualSupplierProductCost: optionalMoney,
  actualSupplierDelivery: optionalMoney,
  actualCustomerDeliveryCost: optionalMoney,
  actualPackagingCost: optionalMoney,
  actualPaymentFee: optionalMoney,
  actualAdvertisingCost: optionalMoney,
}).refine((value) => Object.keys(value).length > 0, 'At least one fulfilment field is required');

const supplierFields = {
  retailer: optionalText(120),
  sourceUrl: z.union([z.url().max(1500), z.literal(''), z.null()]).optional(),
  supplierSku: optionalText(120),
  currentCost: optionalMoney,
  originalDisplayedPrice: optionalMoney,
  stockStatus: z.enum(['in_stock', 'low_stock', 'out_of_stock', 'unknown']).optional(),
  lastCheckedAt: optionalDate,
  promotionStartAt: optionalDate,
  promotionEndAt: optionalDate,
  promotionEndProvided: z.boolean().optional(),
  promotionTerms: optionalText(2000),
  quantityLimit: optionalText(255),
  supplierDeliveryCost: optionalMoney,
  sourceConfidence: z.enum(['low', 'medium', 'high']).optional(),
  supplierPriceVerified: z.boolean().optional(),
  priceUpdatedAt: optionalDate,
  priceChangeReason: optionalText(255),
};

const supplierSchema = z.object(supplierFields).optional();

const productFields = {
  title: z.string().trim().min(3).max(255),
  brand: z.string().trim().max(120),
  model: z.string().trim().max(120),
  barcode: z.string().trim().max(64).nullable().optional(),
  packSize: z.string().trim().max(120),
  category: z.string().trim().min(2).max(100),
  description: z.string().trim().max(10000),
  sellingPrice: z.number().positive().max(10_000_000),
  minimumProfit: optionalMoney,
  estimatedCustomerDeliveryCost: optionalMoney,
  deliveryTime: optionalText(120),
  itemWeightSize: optionalText(120),
  reviewNotes: optionalText(5000),
  specifications: z.record(z.string().max(100), z.string().max(500)).optional(),
  imageUrl: z.union([z.url().max(1000), z.literal(''), z.null()]).optional(),
  supplier: supplierSchema,
  status: z.enum(['draft', 'pending_review', 'published', 'paused']).optional(),
};

export const adminProductCreateSchema = z.object(productFields).extend({
  brand: productFields.brand.default(''), model: productFields.model.default(''), packSize: productFields.packSize.default(''),
  description: productFields.description.default(''), specifications: productFields.specifications.default({}), status: productFields.status.default('draft'),
});
export const adminProductUpdateSchema = z.object(productFields).partial().refine((value) => Object.keys(value).length > 0, 'At least one product field is required');
export const productUrlImportSchema = z.object({ url: z.url().max(1500) });
