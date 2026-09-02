import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { getTestById, updateTest, setTestActive } from "@/lib/database/tests";
import { listAliasesForTest } from "@/lib/database/aliases";
import { listCurrentPricesForTest } from "@/lib/database/prices";
import { recordAuditLog } from "@/lib/database/audit-log";
import { testInputSchema } from "@/lib/validation/test-schema";

// One test's detail: the test record, its aliases, and its current prices
// across every location/service type — for the Admin Tests detail view.
export async function GET(_request: Request, { params }: { params: Promise<{ testId: string }> }) {
  await requireAdmin();
  const { testId } = await params;

  const test = await getTestById(testId);
  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [aliases, prices] = await Promise.all([listAliasesForTest(testId), listCurrentPricesForTest(testId)]);
  return NextResponse.json({ test, aliases, prices });
}

// Body is either { action: "update", ...TestInput } or { action: "setActive", active }.
export async function PATCH(request: Request, { params }: { params: Promise<{ testId: string }> }) {
  const user = await requireAdmin();
  const { testId } = await params;
  const body = await request.json().catch(() => null);

  try {
    if (body?.action === "setActive") {
      const test = await setTestActive(testId, Boolean(body.active));
      await recordAuditLog({
        userId: user.id,
        action: body.active ? "activate_test" : "deactivate_test",
        entity: "tests",
        entityId: testId,
      });
      return NextResponse.json({ test });
    }

    const parsed = testInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const test = await updateTest(testId, parsed.data);
    await recordAuditLog({ userId: user.id, action: "update_test", entity: "tests", entityId: testId, newValue: parsed.data });
    return NextResponse.json({ test });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
