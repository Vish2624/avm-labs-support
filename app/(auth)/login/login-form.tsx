"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSignIcon, CheckIcon, LockIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { signInAction, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

const inputClassName =
  "h-12 w-full rounded-xl border border-input bg-card pl-10 text-[14.5px] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/70 hover:border-muted-foreground/60 focus:border-primary focus:ring-4 focus:ring-primary/15";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  // Signed in: let the "✓ Welcome back" tick land, then open the workspace.
  useEffect(() => {
    if (!state.success) return;
    const timeout = setTimeout(() => {
      router.replace("/workspace");
      router.refresh();
    }, 550);
    return () => clearTimeout(timeout);
  }, [state.success, router]);

  return (
    <form
      action={formAction}
      // Re-keyed on each new error so the shake replays for a repeat mistake.
      key={state.error ? `error-${state.attempt ?? 0}` : "form"}
      className="flex flex-col gap-4"
      style={{
        animation: state.error ? "avm-shake .4s ease" : "avm-fade-up .6s .28s cubic-bezier(.2,.8,.2,1) both",
      }}
    >
      <label className="flex flex-col gap-[7px] text-[13px] font-medium">
        Work email
        <div className="relative">
          <AtSignIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="username"
            placeholder="name@avmlabs.com"
            className={cn(inputClassName, "pr-3.5")}
          />
        </div>
      </label>
      <label className="flex flex-col gap-[7px] text-[13px] font-medium">
        Password
        <div className="relative">
          <LockIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className={cn(inputClassName, "pr-16")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-2 h-[30px] -translate-y-1/2 rounded-lg px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </label>

      {state.error ? (
        <p className="m-0 rounded-[10px] bg-destructive/10 px-3 py-[9px] text-[13px] text-destructive avm-fade-up">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || state.success}
        className="relative mt-1 flex h-[50px] items-center justify-center gap-2.5 overflow-hidden rounded-[13px] bg-primary text-[14.5px] font-medium text-primary-foreground transition-[transform,translate,scale,rotate,box-shadow,filter] duration-200 hover:-translate-y-px hover:shadow-[0_14px_30px_-12px_var(--primary)] hover:brightness-105 active:scale-[0.98] disabled:cursor-wait disabled:opacity-90"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-2/5"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,.28), transparent)",
            animation: "avm-shine 3.2s ease-in-out infinite",
          }}
        />
        {pending ? (
          <span className="size-[15px] animate-spin rounded-full border-2 border-white/35 border-t-white" />
        ) : null}
        {state.success && !pending ? <CheckIcon className="relative size-4 avm-check" /> : null}
        <span className="relative">{pending ? "Signing in…" : state.success ? "Welcome back" : "Sign in"}</span>
      </button>
    </form>
  );
}
