import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/permissions";
import { createCatalogItem, listCatalog } from "@/lib/catalog/admin-catalog";
import { recordAuditLog } from "@/lib/database/audit-log";
import { catalogDetailsSchema } from "@/lib/validation/catalog-schema";
import type { CatalogType } from "@/types/catalog";

const CATALOG_TYPES = ["test", "component", "calculated"] as const satisfies readonly CatalogType[];

// Admin → Tests / Components / Calculated: one type's list, and creating a new item of that type.
export async function GET(request: NextRequest) {
  await requireAdmin();
  const type = z.enum(CATALOG_TYPES).safeParse(request.nextUrl.searchParams.get("type"));
  if (!type.success) return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  return NextResponse.json({ items: await listCatalog(type.data) });
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  const body = await request.json().catch(() => null);
  const type = z.enum(CATALOG_TYPES).safeParse(body?.type);
  const parsed = catalogDetailsSchema.safeParse(body);
  if (!type.success) return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const test = await createCatalogItem(type.data, parsed.data);
    await recordAuditLog({ userId: user.id, action: "create_test", entity: "tests", entityId: test.id, newValue: { type: type.data, ...parsed.data } });
    return NextResponse.json({ test });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
