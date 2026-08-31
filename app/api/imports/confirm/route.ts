import { NextResponse } from "next/server";

// TODO: Confirm and activate a validated import (transactional).
// Placeholder only — not implemented yet (see AVM_PLAN.md).
export async function POST() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
