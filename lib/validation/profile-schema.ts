import { z } from "zod";
import { SERVICE_TYPES } from "@/lib/constants/service-types";
import { AVAILABILITY_STATUSES } from "@/lib/constants/availability";

/** Zod schema for creating/updating a profile's own record (not its tests or pricing). */
export const profileInputSchema = z.object({
  code: z.string().trim().min(1, "Code is required"),
  name: z.string().trim().min(1, "Name is required"),
  description: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => value || null),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

/** Replaces a profile's full set of component tests. */
export const profileTestsInputSchema = z.object({
  tests: z.array(z.object({ testId: z.string().trim().min(1), required: z.boolean() })),
});

export type ProfileTestsInput = z.infer<typeof profileTestsInputSchema>;

/** Sets a profile's bundle price at one location + service type. Price is a decimal major-unit amount, same convention as the Excel import (see lib/excel/transform-excel.ts). */
export const profilePriceInputSchema = z.object({
  locationId: z.string().trim().min(1, "Location is required"),
  serviceType: z.enum(SERVICE_TYPES, "Service Type must be in_house or outsource"),
  price: z.coerce.number("Price must be a number").min(0, "Price cannot be negative"),
  tatText: z.string().trim().min(1, "TAT is required"),
  availability: z.enum(AVAILABILITY_STATUSES, "Invalid availability"),
});

export type ProfilePriceInput = z.infer<typeof profilePriceInputSchema>;
