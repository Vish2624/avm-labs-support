import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/permissions";
import { moveProfileServiceType, removeProfilePrice } from "@/lib/catalog/admin-catalog";
import { SERVICE_TYPES } from "@/lib/constants/service-types";
import { upsertProfilePrice } from "@/lib/database/profiles";
import { getLocationById } from "@/lib/database/locations";
import { recordAuditLog } from "@/lib/database/audit-log";
import { profilePriceInputSchema } from "@/lib/validation/profile-schema";
import { getCurrencyFractionDigits } from "@/lib/pricing/money";

// Sets a profile's bundle price at one location + service type — a direct
// admin correction, not a versioned import (see upsertProfilePrice).
export async function PUT(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const user = await requireAdmin();
  const { profileId } = await params;
  const body = await request.json().catch(() => null);

  const parsed = profilePriceInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const location = await getLocationById(parsed.data.locationId);
  if (!location) {
    return NextResponse.json({ error: "Unknown location" }, { status: 400 });
  }

  try {
    const fractionDigits = getCurrencyFractionDigits(location.currencyCode);
    const minorUnitPrice = Math.round(parsed.data.price * 10 ** fractionDigits);

    const price = await upsertProfilePrice({
      profileId,
      locationId: parsed.data.locationId,
      serviceType: parsed.data.serviceType,
      price: minorUnitPrice,
      currencyCode: location.currencyCode,
      tatText: parsed.data.tatText,
      availability: parsed.data.availability,
    });

    await recordAuditLog({
      userId: user.id,
      action: "set_profile_price",
      entity: "profile_prices",
      entityId: price.id,
      newValue: { profileId, ...parsed.data },
    });
    return NextResponse.json({ price });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

const patchSchema = z.discriminatedUnion("action", [
  // Move every bundle price to the other service type (a profile is In-House or Outsourced, not both).
  z.object({ action: z.literal("moveServiceType"), to: z.enum(SERVICE_TYPES) }),
  // Stop offering the profile at one location + service type.
  z.object({ action: z.literal("remove"), locationId: z.string().min(1), serviceType: z.enum(SERVICE_TYPES) }),
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const user = await requireAdmin();
  const { profileId } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    if (parsed.data.action === "moveServiceType") {
      await moveProfileServiceType(profileId, parsed.data.to);
    } else {
      await removeProfilePrice(profileId, parsed.data.locationId, parsed.data.serviceType);
    }
    await recordAuditLog({
      userId: user.id,
      action: parsed.data.action === "moveServiceType" ? "move_profile_service_type" : "remove_profile_price",
      entity: "profiles",
      entityId: profileId,
      newValue: parsed.data,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
