import { NextResponse } from "next/server";

// TODO: Server-side quotation total validation using safe money arithmetic.
// Placeholder only — not implemented yet (see AVM_PLAN.md).
export async function POST() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
