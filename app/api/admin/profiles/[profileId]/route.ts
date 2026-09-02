import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { getProfileById, updateProfile, setProfileActive, getProfileTestSelections, listProfilePricesForProfile } from "@/lib/database/profiles";
import { recordAuditLog } from "@/lib/database/audit-log";
import { profileInputSchema } from "@/lib/validation/profile-schema";

// One profile's detail: the record, its component test ids, and its
// current bundle prices across every location/service type.
export async function GET(_request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  await requireAdmin();
  const { profileId } = await params;

  const profile = await getProfileById(profileId);
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [testSelections, prices] = await Promise.all([
    getProfileTestSelections(profileId),
    listProfilePricesForProfile(profileId),
  ]);
  return NextResponse.json({ profile, testSelections, prices });
}

// Body is either { action: "update", ...ProfileInput } or { action: "setActive", active }.
export async function PATCH(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const user = await requireAdmin();
  const { profileId } = await params;
  const body = await request.json().catch(() => null);

  try {
    if (body?.action === "setActive") {
      const profile = await setProfileActive(profileId, Boolean(body.active));
      await recordAuditLog({
        userId: user.id,
        action: body.active ? "activate_profile" : "deactivate_profile",
        entity: "profiles",
        entityId: profileId,
      });
      return NextResponse.json({ profile });
    }

    const parsed = profileInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const profile = await updateProfile(profileId, parsed.data);
    await recordAuditLog({ userId: user.id, action: "update_profile", entity: "profiles", entityId: profileId, newValue: parsed.data });
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
