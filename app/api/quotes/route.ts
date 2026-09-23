import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { createQuoteHistoryEntry, listQuoteHistory } from "@/lib/database/quote-history";
import { quoteHistoryInputSchema } from "@/lib/validation/quote-history-schema";

// Quote History: GET lists every unexpired saved quote (2-day retention —
// see lib/database/quote-history.ts); POST saves one when an agent copies
// a reply. Shared across the team, since all agents use one login.
export async function GET() {
  await requireUser();
  const quotes = await listQuoteHistory();
  return NextResponse.json({ quotes });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();

  const body = await request.json().catch(() => null);
  const parsed = quoteHistoryInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const currencies = new Set([
    parsed.data.subtotal.currency,
    parsed.data.total.currency,
    ...parsed.data.lineItems.map((line) => line.price.currency),
  ]);
  if (currencies.size !== 1) {
    return NextResponse.json({ error: "A quote must be priced in one currency" }, { status: 400 });
  }

  try {
    const quote = await createQuoteHistoryEntry(parsed.data, user.id);
    return NextResponse.json({ quote });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
