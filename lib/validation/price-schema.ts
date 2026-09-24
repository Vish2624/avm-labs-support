import { z } from "zod";
import { SERVICE_TYPES } from "@/lib/constants/service-types";
import { parseServiceType } from "@/lib/imports/upload-values";

/**
 * Schema for one parsed Excel price-list row (before minor-unit conversion
 * and catalog/diff checks — see lib/excel/validate-excel.ts for those).
 * Matches AVM_PLAN.md's proposed "Price list file" columns, which are
 * flagged there as pending the user's sign-off; implemented against that
 * proposal in the meantime, same as the plan's other flagged assumptions.
 *
 * `z.coerce` on price handles Excel cells that come through as numbers or
 * numeric strings depending on how the sheet was authored/exported.
 */
export const priceRowSchema = z.object({
  testCode: z.string().trim().min(1, "Test Code is required"),
  testName: z.string().trim().min(1, "Test Name is required"),
  category: z
    .string()
    .trim()
    .nullable()
    .default(null)
    .transform((value) => (value ? value : null)),
  price: z.coerce.number("Price must be a number").min(0, "Price cannot be negative"),
  tat: z.string().trim().min(1, "TAT is required"),
  // "In-House", "IST", "Outsource", "OST"... as well as in_house / outsource.
  serviceType: z.preprocess(
    (value) => (typeof value === "string" ? (parseServiceType(value) ?? value) : value),
    z.enum(SERVICE_TYPES, "Service Type must be In-House or Outsource")
  ),
  available: z
    .union([z.boolean(), z.string()])
    .refine((value) => typeof value === "boolean" || isYesNo(value), {
      message: "Available must be Yes or No",
    })
    .transform((value) => (typeof value === "boolean" ? value : isYes(value))),
  notes: z
    .string()
    .trim()
    .nullable()
    .default(null)
    .transform((value) => (value ? value : null)),
});

export type PriceRowInput = z.infer<typeof priceRowSchema>;

const YES_VALUES = ["yes", "y", "true", "1"];
const NO_VALUES = ["no", "n", "false", "0"];

function isYesNo(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return YES_VALUES.includes(normalized) || NO_VALUES.includes(normalized);
}

function isYes(value: string): boolean {
  return YES_VALUES.includes(value.trim().toLowerCase());
}
