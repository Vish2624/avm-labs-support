import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { setProfileTests } from "@/lib/database/profiles";
import { recordAuditLog } from "@/lib/database/audit-log";
import { profileTestsInputSchema } from "@/lib/validation/profile-schema";

// Replaces a profile's full set of component tests.
export async function PUT(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const user = await requireAdmin();
  const { profileId } = await params;
  const body = await request.json().catch(() => null);

  const parsed = profileTestsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    await setProfileTests(profileId, parsed.data.tests);
    await recordAuditLog({
      userId: user.id,
      action: "set_profile_tests",
      entity: "profile_tests",
      entityId: profileId,
      newValue: parsed.data.tests,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
