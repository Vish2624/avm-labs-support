import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { listAvailabilityRows, updateAvailability } from "@/lib/database/availability";
import { recordAuditLog } from "@/lib/database/audit-log";
import { isServiceType } from "@/lib/constants/service-types";
import { isAvailabilityStatus } from "@/lib/constants/availability";

export async function GET(request: NextRequest) {
  await requireAdmin();

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId") ?? undefined;
  const serviceTypeParam = searchParams.get("serviceType");
  const serviceType = serviceTypeParam && isServiceType(serviceTypeParam) ? serviceTypeParam : undefined;

  const rows = await listAvailabilityRows({ locationId, serviceType });
  return NextResponse.json({ rows });
}

// Body: { kind: "test" | "profile", priceId, availability } — a direct
// quick-edit, not a versioned import (see lib/database/availability.ts).
export async function PATCH(request: NextRequest) {
  const user = await requireAdmin();
  const body = await request.json().catch(() => null);

  const kind = body?.kind;
  const priceId = body?.priceId;
  const availability = body?.availability;

  if ((kind !== "test" && kind !== "profile") || typeof priceId !== "string" || !priceId) {
    return NextResponse.json({ error: "kind and priceId are required" }, { status: 400 });
  }
  if (typeof availability !== "string" || !isAvailabilityStatus(availability)) {
    return NextResponse.json({ error: "Invalid availability" }, { status: 400 });
  }

  try {
    await updateAvailability(kind, priceId, availability);
    await recordAuditLog({
      userId: user.id,
      action: "set_availability",
      entity: kind === "test" ? "test_prices" : "profile_prices",
      entityId: priceId,
      newValue: { availability },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
