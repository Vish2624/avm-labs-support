import { NextResponse } from "next/server";

// TODO: Test search endpoint backing the Support Workspace.
// Placeholder only — not implemented yet (see AVM_PLAN.md).
export async function GET() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
