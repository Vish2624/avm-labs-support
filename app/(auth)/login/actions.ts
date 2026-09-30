"use server";

import { createAuthServerClient } from "@/lib/supabase/server";

export interface LoginState {
  error: string | null;
  /** Counts failed tries, so the form can replay its shake on a repeat error. */
  attempt?: number;
  /** Signed in — the form shows its success tick, then opens the workspace. */
  success?: boolean;
}

/** Supabase Auth signs in by email, so a bare username maps to `<username>@avmlabs.com`. */
const USERNAME_EMAIL_DOMAIN = "avmlabs.com";

function usernameToEmail(username: string): string {
  return username.includes("@") ? username : `${username.toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
}

export async function signInAction(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Enter your username and password.", attempt: (prevState.attempt ?? 0) + 1 };
  }

  const email = usernameToEmail(username);

  const supabase = await createAuthServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Never surface the raw provider error (spec section 48) — one generic
    // message regardless of whether the email or the password was wrong.
    return { error: "Invalid email or password.", attempt: (prevState.attempt ?? 0) + 1 };
  }

  return { error: null, success: true };
}
