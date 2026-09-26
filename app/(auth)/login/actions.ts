"use server";

import { createAuthServerClient } from "@/lib/supabase/server";

export interface LoginState {
  error: string | null;
  /** Counts failed tries, so the form can replay its shake on a repeat error. */
  attempt?: number;
  /** Signed in — the form shows its success tick, then opens the workspace. */
  success?: boolean;
}

export async function signInAction(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password.", attempt: (prevState.attempt ?? 0) + 1 };
  }

  const supabase = await createAuthServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Never surface the raw provider error (spec section 48) — one generic
    // message regardless of whether the email or the password was wrong.
    return { error: "Invalid email or password.", attempt: (prevState.attempt ?? 0) + 1 };
  }

  return { error: null, success: true };
}
