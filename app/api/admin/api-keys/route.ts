import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { recordAuditLog } from "@/lib/database/audit-log";
import { createApiKey, loadUsableKeys } from "@/lib/database/api-keys";
import { pingGeminiKey } from "@/lib/ai/ping-key";
import { API_KEY_ROLES, type ApiKeyRole } from "@/types/api-key";

// Add a Gemini key (Admin > API usage). The key is checked with Google
// first, so a typo never goes live; it's then used straight away.
export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  const body = (await request.json().catch(() => null)) as {
    label?: string;
    role?: string;
    apiKey?: string;
    dailyLimit?: number | null;
  } | null;

  const label = body?.label?.trim() ?? "";
  const apiKey = body?.apiKey?.trim() ?? "";
  const role = body?.role as ApiKeyRole;
  const dailyLimit = body?.dailyLimit ?? null;
  if (!label || label.length > 60) return NextResponse.json({ error: "Give the key a name (up to 60 characters)." }, { status: 400 });
  // Allows "." for Google's newer "AQ.…" key format as well as classic "AIza…" keys.
  if (!/^[\w.-]{10,200}$/.test(apiKey)) return NextResponse.json({ error: "That doesn't look like a Gemini API key." }, { status: 400 });
  if (!API_KEY_ROLES.includes(role)) return NextResponse.json({ error: "Pick what the key is for." }, { status: 400 });
  if (dailyLimit !== null && !(Number.isInteger(dailyLimit) && dailyLimit > 0)) {
    return NextResponse.json({ error: "Daily limit must be a whole number above 0, or blank." }, { status: 400 });
  }
  if ((await loadUsableKeys()).some((key) => key.apiKey === apiKey)) {
    return NextResponse.json({ error: "This key is already in use." }, { status: 409 });
  }

  const ping = await pingGeminiKey(apiKey);
  if (!ping.ok) return NextResponse.json({ error: ping.message }, { status: 400 });

  try {
    const key = await createApiKey({ label, role, apiKey, dailyLimit });
    await recordAuditLog({ userId: user.id, action: "add_api_key", entity: "api_keys", entityId: key.id, newValue: { label, role, hint: key.hint } });
    return NextResponse.json({ key });
  } catch (error) {
    const message = (error as { message?: string }).message ?? "";
    return NextResponse.json(
      { error: /api_keys/.test(message) && /does not exist|schema cache/.test(message) ? "Run the API usage SQL in Supabase first." : message || "Couldn't save the key." },
      { status: 500 }
    );
  }
}
