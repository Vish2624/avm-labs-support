import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { insertSearchEvent } from "@/lib/database/search-events";
import { looksLikePhoneNumber, searchEventInputSchema } from "@/lib/validation/search-event-schema";
import { normalizeQuery } from "@/lib/search/normalize-query";

// Finished-search log (use-search-telemetry.ts) — what agents search for,
// pick, and fail to find, for the admin's missed-searches review.
export async function POST(request: NextRequest) {
  await requireUser();

  const body = await request.json().catch(() => null);
  const parsed = searchEventInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const event = parsed.data;
  const normalizedQuery = normalizeQuery(event.query);
  // The browser already drops phone-number-like queries; this is the backstop.
  if (!normalizedQuery || looksLikePhoneNumber(event.query)) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    await insertSearchEvent({
      ...event,
      normalizedQuery,
      previousMissQuery: event.previousMissQuery ? normalizeQuery(event.previousMissQuery) || null : null,
    });
  } catch (error) {
    // Logging is best-effort — it must never surface as an error to the agent.
    console.error("search event not recorded", error);
  }
  return new NextResponse(null, { status: 204 });
}
