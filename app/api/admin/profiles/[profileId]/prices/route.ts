import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
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
