import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./auth";
import type { AuthUser } from "@/types/auth";

/**
 * Server-side authorization guards. Call these at the top of a Server
 * Component/Action/Route Handler that must be protected — never rely on
 * hiding a nav link alone (spec section 38/54).
 */

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/workspace");
  return user;
}
