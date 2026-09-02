import { z } from "zod";

/** Zod schema for creating/updating a master catalog test via the Admin UI. */
export const testInputSchema = z.object({
  code: z.string().trim().min(1, "Code is required"),
  officialName: z.string().trim().min(1, "Official name is required"),
  shortName: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => value || null),
  category: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => value || null),
  description: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => value || null),
});

export type TestInput = z.infer<typeof testInputSchema>;
