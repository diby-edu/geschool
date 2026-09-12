import { z } from 'zod';

export const BILLING_PERIODS = ['MONTHLY', 'QUARTERLY', 'YEARLY', 'ONE_TIME'] as const;
export const SUBSCRIPTION_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'] as const;
export const PAYMENT_METHODS = ['MOBILE_MONEY', 'BANK_TRANSFER', 'CASH', 'CARD', 'OTHER'] as const;
export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED'] as const;

/** Un plan tarifaire. Quotas dans `limits` (0 = illimité). */
export const planSchema = z.object({
  code: z.string().trim().min(1, 'Code requis.').max(40),
  name: z.string().trim().min(1, 'Nom requis.').max(120),
  description: z.string().trim().max(500).default(''),
  priceAmount: z.coerce.number().min(0).max(100_000_000),
  currency: z.string().trim().length(3).default('XOF'),
  billingPeriod: z.enum(BILLING_PERIODS),
  limitStudents: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limitUsers: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limitStorageMb: z.coerce.number().int().min(0).max(10_000_000).default(0),
  limitSms: z.coerce.number().int().min(0).max(10_000_000).default(0),
  isPublic: z.coerce.boolean().default(true),
  isActive: z.coerce.boolean().default(true),
});

export type PlanInput = z.infer<typeof planSchema>;

export const subscriptionSchema = z.object({
  planId: z.uuid('Plan requis.'),
  status: z.enum(SUBSCRIPTION_STATUSES),
  trialEndsAt: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional(),
  periodStart: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional(),
  periodEnd: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional(),
});

export type SubscriptionInput = z.infer<typeof subscriptionSchema>;

export const paymentSchema = z.object({
  amount: z.coerce.number().min(0, 'Montant invalide.').max(100_000_000),
  currency: z.string().trim().length(3).default('XOF'),
  method: z.enum(PAYMENT_METHODS),
  status: z.enum(PAYMENT_STATUSES).default('PAID'),
  reference: z.string().trim().max(120).default(''),
  notes: z.string().trim().max(500).default(''),
});

export type PaymentInput = z.infer<typeof paymentSchema>;
