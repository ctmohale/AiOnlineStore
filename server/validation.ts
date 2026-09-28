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
  minimumProfit: z.number().nonnegative(), minimumMarginPercent: z.number().min(0).max(100), freeDeliveryThreshold: z.number().nonnegative(), standardCustomerDelivery: z.number().nonnegative(), supplierStaleHours: z.number().int().min(1).max(168),
});

export const orderStatusSchema = z.object({ status: z.enum(['requested','checking_supplier','quoted','awaiting_payment','paid','purchasing','shipped','delivered','cancelled','refunded']) });
