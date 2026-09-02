import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { updateAlias, setAliasActive, deleteAlias } from "@/lib/database/aliases";
import { recordAuditLog } from "@/lib/database/audit-log";
import { aliasInputSchema } from "@/lib/validation/alias-schema";
import { normalizeQuery } from "@/lib/search/normalize-query";

// Body is either { action: "update", ...AliasInput } or { action: "setActive", active }.
export async function PATCH(request: Request, { params }: { params: Promise<{ aliasId: string }> }) {
  const user = await requireAdmin();
  const { aliasId } = await params;
  const body = await request.json().catch(() => null);

  try {
    if (body?.action === "setActive") {
      const alias = await setAliasActive(aliasId, Boolean(body.active));
      await recordAuditLog({
        userId: user.id,
        action: body.active ? "activate_alias" : "deactivate_alias",
        entity: "test_aliases",
        entityId: aliasId,
      });
      return NextResponse.json({ alias });
    }

    const parsed = aliasInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const alias = await updateAlias(aliasId, { ...parsed.data, normalizedAlias: normalizeQuery(parsed.data.alias) });
    await recordAuditLog({ userId: user.id, action: "update_alias", entity: "test_aliases", entityId: aliasId, newValue: parsed.data });
    return NextResponse.json({ alias });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ aliasId: string }> }) {
  const user = await requireAdmin();
  const { aliasId } = await params;

  try {
    await deleteAlias(aliasId);
    await recordAuditLog({ userId: user.id, action: "delete_alias", entity: "test_aliases", entityId: aliasId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
