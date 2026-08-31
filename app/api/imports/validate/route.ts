import { NextResponse } from "next/server";

// TODO: Validate a staged Excel import and return the validation report.
// Placeholder only — not implemented yet (see AVM_PLAN.md).
export async function POST() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
