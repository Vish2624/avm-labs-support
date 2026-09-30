import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value) => value || null);

/** A catalog item's details as the Admin editor sends them (the type is never part of it). */
export const catalogDetailsSchema = z.object({
  code: optionalText,
  officialName: z.string().trim().min(1, "Name is required"),
  shortName: optionalText,
  description: optionalText,
  /** Calculated parameters only: the profile it's only ordered within (its code), or null for its own tests. */
  viaProfileCode: optionalText,
});
