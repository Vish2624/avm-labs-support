import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { getQuoteHistoryEntry } from "@/lib/database/quote-history";
import { repriceQuote } from "@/lib/quotes/reprice-quote";
import { reopenQuoteSchema } from "@/lib/validation/quote-history-schema";

// "Reopen in Quote": rebuilds a saved quote's lines from current prices
// (never the saved snapshot) so the reopened quote is safe to resend.
export async function POST(request: NextRequest) {
  await requireUser();

  const body = await request.json().catch(() => null);
  const parsed = reopenQuoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid quote id" }, { status: 400 });
  }

  const entry = await getQuoteHistoryEntry(parsed.data.id);
  if (!entry) {
    return NextResponse.json({ error: "This quote has expired or no longer exists." }, { status: 404 });
  }

  const { lineItems, dropped } = await repriceQuote(entry.locationId, entry.lineItems);
  return NextResponse.json({
    locationId: entry.locationId,
    customerName: entry.customerName ?? "",
    lineItems,
    dropped,
  });
}
