import { NextResponse } from "next/server";

// TODO: Profile search endpoint (by name or by test names) backing /profiles.
// Placeholder only — not implemented yet (see AVM_PLAN.md).
export async function GET() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
