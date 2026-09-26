import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { recommendTests } from "@/lib/ai-assistant/recommend-tests";
import { SERVICE_TYPES, isServiceType } from "@/lib/constants/service-types";

// AI Test Assistant: a customer's natural-language question -> relevant
// catalog tests for the quotation. Separate from /api/search; it never
// changes what the test search returns.
export async function POST(request: NextRequest) {
  await requireUser();

  const body = (await request.json().catch(() => null)) as {
    question?: unknown;
    locationId?: unknown;
    serviceType?: unknown;
  } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const locationId = typeof body?.locationId === "string" ? body.locationId : "";
  const serviceType = typeof body?.serviceType === "string" ? body.serviceType : "";

  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }
  if (question.length > 2_000) {
    return NextResponse.json({ error: "Question is too long." }, { status: 400 });
  }
  if (!locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }
  const serviceTypes = serviceType === "all" ? SERVICE_TYPES : isServiceType(serviceType) ? [serviceType] : null;
  if (!serviceTypes) {
    return NextResponse.json({ error: "serviceType must be all, in_house or outsource" }, { status: 400 });
  }

  return NextResponse.json(await recommendTests(question, locationId, serviceTypes));
}
