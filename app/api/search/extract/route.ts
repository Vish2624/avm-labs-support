import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { extractTests } from "@/lib/search/extract-tests";
import { SERVICE_TYPES, isServiceType } from "@/lib/constants/service-types";

// Bulk test extraction backing the Support Workspace's "Paste a message"
// tab and list-style queries in the search box ("ACCP, ALKP, AMYL, ...").
// POST, since a pasted message can be far longer than a sane query string.
export async function POST(request: NextRequest) {
  await requireUser();

  const body = (await request.json().catch(() => null)) as {
    text?: unknown;
    locationId?: unknown;
    serviceType?: unknown;
  } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  const locationId = typeof body?.locationId === "string" ? body.locationId : "";
  const serviceType = typeof body?.serviceType === "string" ? body.serviceType : "";

  if (!locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }
  const serviceTypes = serviceType === "all" ? SERVICE_TYPES : isServiceType(serviceType) ? [serviceType] : null;
  if (!serviceTypes) {
    return NextResponse.json({ error: "serviceType must be all, in_house or outsource" }, { status: 400 });
  }
  if (text.length > 20_000) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }

  const result = await extractTests(text, locationId, serviceTypes);
  return NextResponse.json(result);
}
