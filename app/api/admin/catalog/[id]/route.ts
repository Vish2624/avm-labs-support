import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/permissions";
import {
  getCatalogItem,
  moveCatalogServiceType,
  removeCatalogPrice,
  saveParameters,
  saveSources,
  setCatalogPrice,
  updateCatalogDetails,
} from "@/lib/catalog/admin-catalog";
import { setTestActive } from "@/lib/database/tests";
import { recordAuditLog } from "@/lib/database/audit-log";
import { SERVICE_TYPES } from "@/lib/constants/service-types";
import { AVAILABILITY_STATUSES } from "@/lib/constants/availability";
import { catalogDetailsSchema } from "@/lib/validation/catalog-schema";

// One catalog item: GET its full detail; PATCH one change at a time —
// { action: "details" | "setActive" | "setPrice" | "removePrice" | "moveServiceType" | "parameters" | "sources", ... }.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const item = await getCatalogItem(id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(item);
}

const priceSchema = z.object({
  locationId: z.string().min(1),
  serviceType: z.enum(SERVICE_TYPES),
  price: z.coerce.number("Price must be a number").min(0, "Price can't be negative"),
  tatText: z.string().trim().min(1, "TAT is required"),
  availability: z.enum(AVAILABILITY_STATUSES),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const audit = (action: string, newValue?: unknown) =>
    recordAuditLog({ userId: user.id, action, entity: "tests", entityId: id, newValue });
  const invalid = (error: z.ZodError) =>
    NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  try {
    switch (body?.action) {
      case "details": {
        const parsed = catalogDetailsSchema.safeParse(body);
        if (!parsed.success) return invalid(parsed.error);
        await updateCatalogDetails(id, parsed.data);
        await audit("update_test", parsed.data);
        break;
      }
      case "setActive": {
        await setTestActive(id, Boolean(body.active));
        await audit(body.active ? "activate_test" : "deactivate_test");
        break;
      }
      case "setPrice": {
        const parsed = priceSchema.safeParse(body);
        if (!parsed.success) return invalid(parsed.error);
        await setCatalogPrice({ testId: id, userId: user.id, ...parsed.data });
        break;
      }
      case "removePrice": {
        const parsed = priceSchema.pick({ locationId: true, serviceType: true }).safeParse(body);
        if (!parsed.success) return invalid(parsed.error);
        await removeCatalogPrice(id, parsed.data.locationId, parsed.data.serviceType);
        await audit("remove_test_price", parsed.data);
        break;
      }
      case "moveServiceType": {
        const parsed = z.object({ to: z.enum(SERVICE_TYPES) }).safeParse(body);
        if (!parsed.success) return invalid(parsed.error);
        await moveCatalogServiceType(id, parsed.data.to, user.id);
        await audit("move_service_type", parsed.data);
        break;
      }
      case "parameters": {
        const parsed = z
          .object({ parameters: z.array(z.object({ id: z.string().optional(), name: z.string() })) })
          .safeParse(body);
        if (!parsed.success) return invalid(parsed.error);
        await saveParameters(id, parsed.data.parameters);
        await audit("update_component_parameters", { count: parsed.data.parameters.length });
        break;
      }
      case "sources": {
        const parsed = z.object({ sourceIds: z.array(z.string()) }).safeParse(body);
        if (!parsed.success) return invalid(parsed.error);
        await saveSources(id, parsed.data.sourceIds);
        await audit("update_calculated_sources", parsed.data);
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    return NextResponse.json(await getCatalogItem(id));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
