import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { listAllTests, createTest } from "@/lib/database/tests";
import { recordAuditLog } from "@/lib/database/audit-log";
import { testInputSchema } from "@/lib/validation/test-schema";

// Admin master-catalog listing + creation. Search-tests.ts only ever reads
// active tests; this is the full catalog (active + inactive) for admin
// management.
export async function GET() {
  await requireAdmin();
  const tests = await listAllTests();
  return NextResponse.json({ tests });
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin();

  const body = await request.json().catch(() => null);
  const parsed = testInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const test = await createTest(parsed.data);
    await recordAuditLog({ userId: user.id, action: "create_test", entity: "tests", entityId: test.id, newValue: parsed.data });
    return NextResponse.json({ test });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
