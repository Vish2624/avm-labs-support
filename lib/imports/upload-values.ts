import { getCurrencyFractionDigits } from "@/lib/pricing/money";
import type { ServiceType } from "@/lib/constants/service-types";
import type { Location } from "@/types/location";

// Cell-value readers shared by the test-details and profile uploads
// (lib/imports/test-details-import.ts, profile-details-import.ts). Each
// returns null for a value it can't read, so the caller can report the row.

/** One problem with an uploaded file; row 0 means the file as a whole. */
export interface UploadIssue {
  row: number;
  message: string;
}

const IN_HOUSE = ["inhouse", "ist", "internal"];
const OUTSOURCE = ["outsource", "outsourced", "ost", "outlab", "external", "referral"];

export function parseServiceType(text: string): ServiceType | null {
  const key = text.toLowerCase().replace(/[^a-z]/g, "");
  if (IN_HOUSE.includes(key)) return "in_house";
  if (OUTSOURCE.includes(key)) return "outsource";
  return null;
}

/** Matches a location by name or code, case-insensitively ("Dubai", "dxb"). */
export function resolveLocation(text: string, locations: Location[]): Location | null {
  const key = text.trim().toLowerCase();
  return locations.find((location) => location.name.toLowerCase() === key || location.code.toLowerCase() === key) ?? null;
}

const YES = ["yes", "y", "true", "1", "available", "active"];
const NO = ["no", "n", "false", "0", "unavailable", "inactive"];

export function parseYesNo(text: string): boolean | null {
  const key = text.trim().toLowerCase();
  if (YES.includes(key)) return true;
  if (NO.includes(key)) return false;
  return null;
}

/**
 * A price cell ("45", "45.50", "AED 45.50", "1,250.000") in the location
 * currency's major unit, converted to its integer minor unit (fils/halalas)
 * — see lib/pricing/money.ts. Null when it isn't a non-negative number.
 */
export function parsePrice(text: string, currencyCode: string): number | null {
  const cleaned = text.replace(/[^0-9.\-]/g, "");
  if (!cleaned || !/^\d*\.?\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 10 ** getCurrencyFractionDigits(currencyCode));
}

/** Splits a list cell ("CHOL, TRIG; HDL") into trimmed, de-duplicated entries. */
export function splitList(text: string | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,;\n|]+/)) {
    const value = part.trim();
    if (value && !seen.has(value.toLowerCase())) {
      seen.add(value.toLowerCase());
      out.push(value);
    }
  }
  return out;
}

/** Formats a minor-unit amount back to the sheet's major unit, for previews. */
export function formatMajor(amount: number, currencyCode: string): string {
  const digits = getCurrencyFractionDigits(currencyCode);
  return `${currencyCode} ${(amount / 10 ** digits).toFixed(digits)}`;
}
