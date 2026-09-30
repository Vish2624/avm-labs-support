import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { recordAuditLog } from "@/lib/database/audit-log";
import { deleteApiKey, getApiKeySecret, updateApiKey } from "@/lib/database/api-keys";
import { pingGeminiKey } from "@/lib/ai/ping-key";
import { API_KEY_ROLES, type ApiKeyRole } from "@/types/api-key";

// One Gemini key on Admin > API usage: POST tests it with Google, PATCH
// renames / reassigns / pauses it or sets its daily limit, DELETE removes a
// key added on the page (env keys can only be paused — they live in Vercel).

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const secret = await getApiKeySecret(id).catch(() => null);
  if (!secret) return NextResponse.json({ ok: false, message: "This key has no value set.", ms: 0 });
  return NextResponse.json(await pingGeminiKey(secret));
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    label?: string;
    role?: string;
    dailyLimit?: number | null;
    active?: boolean;
  } | null;
  if (!body) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const changes: Parameters<typeof updateApiKey>[1] = {};
  if (body.label !== undefined) {
    const label = body.label.trim();
    if (!label || label.length > 60) return NextResponse.json({ error: "Name must be 1-60 characters." }, { status: 400 });
    changes.label = label;
  }
  if (body.role !== undefined) {
    if (!API_KEY_ROLES.includes(body.role as ApiKeyRole)) return NextResponse.json({ error: "Unknown feature." }, { status: 400 });
    changes.role = body.role as ApiKeyRole;
  }
  if (body.dailyLimit !== undefined) {
    if (body.dailyLimit !== null && !(Number.isInteger(body.dailyLimit) && body.dailyLimit > 0)) {
      return NextResponse.json({ error: "Daily limit must be a whole number above 0, or blank." }, { status: 400 });
    }
    changes.dailyLimit = body.dailyLimit;
  }
  if (body.active !== undefined) changes.active = Boolean(body.active);

  await updateApiKey(id, changes);
  await recordAuditLog({ userId: user.id, action: "update_api_key", entity: "api_keys", entityId: id, newValue: changes });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  if (!(await deleteApiKey(id))) {
    return NextResponse.json({ error: "Keys set in Vercel can only be paused here." }, { status: 400 });
  }
  await recordAuditLog({ userId: user.id, action: "delete_api_key", entity: "api_keys", entityId: id });
  return NextResponse.json({ ok: true });
}
