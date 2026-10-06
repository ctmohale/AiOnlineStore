import { z } from 'zod';

export const orderSchema = z.object({
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

export const reviewChecklistSchema = z.object({
  exactProductMatch: z.literal(true),
  supplierPriceChecked: z.literal(true),
  stockChecked: z.literal(true),
  promotionDatesChecked: z.literal(true),
  imagesChecked: z.literal(true),
  descriptionChecked: z.literal(true),
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
  checklist: reviewChecklistSchema,
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

const emailCodeSchema = z.string().trim().regex(/^\d{6}$/, 'Enter the six-digit code from your email');

export const customerEmailVerificationSchema = z.object({
  email: z.email().max(190),
  code: emailCodeSchema,
});

export const customerVerificationResendSchema = z.object({ email: z.email().max(190) });

export const customerForgotPasswordSchema = z.object({ email: z.email().max(190) });

export const customerPasswordResetSchema = z.object({
  email: z.email().max(190),
  code: emailCodeSchema,
  newPassword: z.string().min(10).max(128),
});

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

export const customerCartSchema = z.object({
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(20),
  })).max(50).refine((items) => new Set(items.map((item) => item.productId)).size === items.length, 'Each product can only appear once in the cart'),
});

export const customerCartItemSchema = z.object({ quantity: z.number().int().min(1).max(20) });

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

export const supplierItemVerificationSchema = z.object({
  status: z.enum(['verified', 'unavailable']),
  verifiedSupplierUnitCost: z.number().positive().max(10_000_000).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, context) => {
  if (value.status === 'verified' && value.verifiedSupplierUnitCost == null) {
    context.addIssue({ code: 'custom', path: ['verifiedSupplierUnitCost'], message: 'Enter the supplier cost confirmed during this check' });
  }
});

const supportReason = z.enum(['changed_mind','incorrect_item','damaged','defective','late_delivery','duplicate_order','address_problem','supplier_unavailable','other']);
const supportStatus = z.enum(['open','reviewing','approved','declined','collection_scheduled','in_transit','received','resolved','closed']);
const supportResolution = z.enum(['pending','refund','replacement','repair','cancelled_without_charge','declined','other']);
const optionalSupportUrl = z.union([z.url().max(1500).refine((value) => value.startsWith('https://'), 'Use an HTTPS link'), z.literal(''), z.null()]).optional();

export const supportCaseCreateSchema = z.object({
  caseType: z.enum(['cancellation','return']),
  reasonCategory: supportReason,
  reasonDetails: z.string().trim().min(3).max(5000),
  evidenceUrls: z.array(z.url().max(1500).refine((value) => value.startsWith('https://'), 'Use HTTPS evidence links')).max(10).default([]),
});

export const supportCaseUpdateSchema = z.object({
  status: supportStatus,
  supplierReturnReference: z.string().trim().max(190).nullable().optional(),
  supplierReturnUrl: optionalSupportUrl,
  returnCourierName: z.string().trim().max(120).nullable().optional(),
  returnTrackingNumber: z.string().trim().max(160).nullable().optional(),
  returnTrackingUrl: optionalSupportUrl,
  resolution: supportResolution,
  refundAmount: z.number().nonnegative().max(10_000_000).nullable().optional(),
  internalNotes: z.string().trim().max(5000).nullable().optional(),
}).superRefine((value, context) => {
  if (value.resolution === 'refund' && value.status === 'resolved' && value.refundAmount == null) {
    context.addIssue({ code: 'custom', path: ['refundAmount'], message: 'Record the refund amount before resolving this case' });
  }
});


const supplierFields = {
  retailer: optionalText(120),
  sourceUrl: z.union([z.url().max(1500), z.literal(''), z.null()]).optional(),
  supplierSku: optionalText(120),
  currentCost: optionalMoney,
  originalDisplayedPrice: optionalMoney,
  stockStatus: z.enum(['in_stock', 'low_stock', 'out_of_stock', 'unknown']).optional(),
  fulfilmentType: z.enum(['store_stock', 'warehouse', 'online_only', 'unknown']).optional(),
  fulfilmentSignal: optionalText(255),
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
  imageUrls: z.array(z.url().max(1000).refine((value) => value.startsWith('https://'), 'Use HTTPS image links')).max(20).optional(),
  supplier: supplierSchema,
  status: z.enum(['draft', 'pending_review', 'published', 'paused']).optional(),
};

export const adminProductCreateSchema = z.object(productFields).extend({
  brand: productFields.brand.default(''), model: productFields.model.default(''), packSize: productFields.packSize.default(''),
  description: productFields.description.default(''), specifications: productFields.specifications.default({}), status: productFields.status.default('draft'),
});
export const adminProductUpdateSchema = z.object(productFields).partial().refine((value) => Object.keys(value).length > 0, 'At least one product field is required');
export const productUrlImportSchema = z.object({ url: z.url().max(1500) });
