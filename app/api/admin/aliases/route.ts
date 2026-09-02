import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { listAllAliasesWithTest, createAlias } from "@/lib/database/aliases";
import { recordAuditLog } from "@/lib/database/audit-log";
import { aliasInputSchema } from "@/lib/validation/alias-schema";
import { normalizeQuery } from "@/lib/search/normalize-query";

export async function GET() {
  await requireAdmin();
  const aliases = await listAllAliasesWithTest();
  return NextResponse.json({ aliases });
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin();

  const body = await request.json().catch(() => null);
  const parsed = aliasInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const alias = await createAlias({ ...parsed.data, normalizedAlias: normalizeQuery(parsed.data.alias) });
    await recordAuditLog({ userId: user.id, action: "create_alias", entity: "test_aliases", entityId: alias.id, newValue: parsed.data });
    return NextResponse.json({ alias });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
