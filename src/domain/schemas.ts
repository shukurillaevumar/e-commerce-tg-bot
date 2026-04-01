import { z } from "zod";

export const telegramUserSchema = z.object({
  id: z.number().int().nonnegative(),
  username: z.string().min(1).max(64).nullable().optional(),
  first_name: z.string().min(1).max(128).nullable().optional(),
  last_name: z.string().min(1).max(128).nullable().optional(),
  language_code: z.string().min(2).max(10).nullable().optional(),
  is_bot: z.boolean().default(false),
});

export const callbackDataSchema = z.object({
  action: z.string().min(1).max(64),
  id: z.string().min(1).max(64).optional(),
  extra: z.string().max(256).optional(),
});

export const createSupportTicketSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(5).max(4000),
});

export const applyPromoSchema = z.object({
  code: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/),
});

export const updateExchangeRateSchema = z.object({
  rateRubPerStar: z.number().positive(),
  comment: z.string().trim().max(500).optional(),
});

export const createProductSchema = z.object({
  slug: z.string().trim().min(3).max(120),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(1000),
  isFeatured: z.boolean().default(false),
});

export const createVariantSchema = z.object({
  productId: z.string().trim().min(1),
  sku: z.string().trim().min(3).max(64),
  title: z.string().trim().min(3).max(120),
  packageSize: z.string().trim().max(120).nullable().optional(),
  tariff: z.string().trim().max(120).nullable().optional(),
  offerType: z.string().trim().max(120).nullable().optional(),
  rubPrice: z.number().int().positive(),
  fulfillmentStrategy: z.enum(["mock", "manual", "external_api", "custom"]),
});
