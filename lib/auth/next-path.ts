/**
 * A same-site path to return to after signing in (`/login?next=...`), or
 * null. Only plain in-app paths are accepted — never an outside URL
 * ("//evil.com", "/\evil.com"), so the login redirect can't be abused.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (value === "/login" || value.startsWith("/login?")) return null;
  return value;
}
