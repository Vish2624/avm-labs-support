import { z } from "zod";
import { SERVICE_TYPES } from "@/lib/constants/service-types";

const moneySchema = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.string().trim().min(3).max(3),
});

/** Zod schema for saving a copied quote to History (POST /api/quotes). */
export const quoteHistoryInputSchema = z.object({
  locationId: z.guid(),
  customerName: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .optional()
    .transform((value) => value || null),
  lineItems: z
    .array(
      z.object({
        kind: z.enum(["test", "package"]),
        refId: z.guid(),
        code: z.string().trim().min(1),
        name: z.string().trim().min(1),
        serviceType: z.enum(SERVICE_TYPES),
        price: moneySchema,
      })
    )
    .min(1, "A saved quote needs at least one line"),
  subtotal: moneySchema,
  discountPercent: z.number().int().min(0).max(100),
  total: moneySchema,
  replyText: z.string().min(1).max(20_000),
});

export const reopenQuoteSchema = z.object({ id: z.guid() });
