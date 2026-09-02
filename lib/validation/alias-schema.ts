import { z } from "zod";
import { ALIAS_TYPES } from "@/lib/constants/alias-types";

/** Zod schema for creating/updating a test alias via the Admin UI. */
export const aliasInputSchema = z.object({
  testId: z.string().trim().min(1, "Select a test"),
  alias: z.string().trim().min(1, "Alias text is required"),
  aliasType: z.enum(ALIAS_TYPES, "Invalid alias type"),
  confidence: z.coerce.number("Confidence must be a number").min(0).max(100),
});

export type AliasInput = z.infer<typeof aliasInputSchema>;
