import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  QUOTE_HISTORY_RETENTION_DAYS,
  type QuoteHistoryEntry,
  type QuoteHistoryInput,
  type QuoteHistoryLine,
} from "@/types/quote-history";

const QUOTE_HISTORY_COLUMNS =
  "id, created_at, location_id, customer_name, line_items, currency_code, subtotal, discount_percent, total, reply_text";

// Plenty for 2 days of a 5-person team's quotes; keeps the payload bounded.
const MAX_ENTRIES = 500;

interface QuoteHistoryRow {
  id: string;
  created_at: string;
  location_id: string;
  customer_name: string | null;
  line_items: QuoteHistoryLine[];
  currency_code: string;
  subtotal: number;
  discount_percent: number;
  total: number;
  reply_text: string;
}

function mapQuoteHistory(row: QuoteHistoryRow): QuoteHistoryEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    locationId: row.location_id,
    customerName: row.customer_name,
    lineItems: row.line_items,
    subtotal: { amount: row.subtotal, currency: row.currency_code },
    discountPercent: row.discount_percent,
    total: { amount: row.total, currency: row.currency_code },
    replyText: row.reply_text,
  };
}

function expiryCutoff(): string {
  return new Date(Date.now() - QUOTE_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Deletes entries past the retention window. Called on every read and
 * write, so expired quotes disappear without needing a scheduled job —
 * and reads also filter by the cutoff, so an entry is never shown past
 * expiry even if this delete fails.
 */
async function purgeExpiredQuotes(): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("quote_history").delete().lt("created_at", expiryCutoff());
  if (error) console.error("Failed to purge expired quote history", error);
}

/** Every unexpired saved quote, newest first. */
export async function listQuoteHistory(): Promise<QuoteHistoryEntry[]> {
  await purgeExpiredQuotes();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("quote_history")
    .select(QUOTE_HISTORY_COLUMNS)
    .gte("created_at", expiryCutoff())
    .order("created_at", { ascending: false })
    .limit(MAX_ENTRIES);

  if (error) throw error;
  return ((data ?? []) as QuoteHistoryRow[]).map(mapQuoteHistory);
}

/** One unexpired saved quote by id, or null. */
export async function getQuoteHistoryEntry(id: string): Promise<QuoteHistoryEntry | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("quote_history")
    .select(QUOTE_HISTORY_COLUMNS)
    .eq("id", id)
    .gte("created_at", expiryCutoff())
    .maybeSingle();

  if (error) throw error;
  return data ? mapQuoteHistory(data as QuoteHistoryRow) : null;
}

export async function createQuoteHistoryEntry(input: QuoteHistoryInput, userId: string): Promise<QuoteHistoryEntry> {
  await purgeExpiredQuotes();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("quote_history")
    .insert({
      created_by: userId,
      location_id: input.locationId,
      customer_name: input.customerName,
      line_items: input.lineItems,
      currency_code: input.total.currency,
      subtotal: input.subtotal.amount,
      discount_percent: input.discountPercent,
      total: input.total.amount,
      reply_text: input.replyText,
    })
    .select(QUOTE_HISTORY_COLUMNS)
    .single();

  if (error) throw error;
  return mapQuoteHistory(data as QuoteHistoryRow);
}
