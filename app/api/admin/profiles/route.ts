import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { listAllProfilesForAdmin, createProfile } from "@/lib/database/profiles";
import { recordAuditLog } from "@/lib/database/audit-log";
import { profileInputSchema } from "@/lib/validation/profile-schema";

export async function GET() {
  await requireAdmin();
  const profiles = await listAllProfilesForAdmin();
  return NextResponse.json({ profiles });
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin();

  const body = await request.json().catch(() => null);
  const parsed = profileInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const profile = await createProfile(parsed.data);
    await recordAuditLog({ userId: user.id, action: "create_profile", entity: "profiles", entityId: profile.id, newValue: parsed.data });
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
