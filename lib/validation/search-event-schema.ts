import { z } from "zod";

/**
 * Zod schema for one finished Support Workspace search, posted by use-search-telemetry.ts.
 * IDs use z.guid(), not z.uuid(): the seeded locations have fixed ids like
 * 00000000-0000-0000-0000-000000000001, which z.uuid()'s RFC version check rejects.
 */
export const searchEventInputSchema = z.object({
  query: z.string().trim().min(1).max(100),
  locationId: z.guid().nullable(),
  resultCount: z.number().int().min(0).max(1000),
  pickedTestId: z.guid().nullable(),
  pickedRank: z.number().int().min(1).nullable(),
  previousMissQuery: z.string().trim().min(1).max(100).nullable(),
});

export type SearchEventInput = z.infer<typeof searchEventInputSchema>;

/**
 * True when a search-box query holds 6+ digits in a row (single spaces or
 * dashes allowed between them) — most likely a customer's pasted phone
 * number, so the search is never logged. "b12 d3", "25 oh" don't qualify.
 */
export function looksLikePhoneNumber(query: string): boolean {
  return /(\d[\s-]?){5}\d/.test(query);
}
