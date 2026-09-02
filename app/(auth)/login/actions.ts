"use server";

import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/server";

export interface LoginState {
  error: string | null;
}

export async function signInAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createAuthServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Never surface the raw provider error (spec section 48) — one generic
    // message regardless of whether the email or the password was wrong.
    return { error: "Invalid email or password." };
  }

  redirect("/workspace");
}
