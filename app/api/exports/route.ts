import { NextResponse } from "next/server";

// TODO: Export current active database state as .xlsx.
// Placeholder only — not implemented yet (see AVM_PLAN.md).
export async function GET() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
