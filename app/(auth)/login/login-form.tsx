"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { signInAction, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email" className="text-[12.5px] font-medium text-muted-foreground">
          Work email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="username"
          placeholder="you@avmlabs.com"
          className="h-[46px] rounded-xl px-3.5 text-[14.5px]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password" className="text-[12.5px] font-medium text-muted-foreground">
          Password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="h-[46px] rounded-xl px-3.5 text-[14.5px]"
        />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" size="lg" className="mt-1.5 w-full rounded-xl" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
        Trouble signing in? Ask an admin to reset your access.
      </p>
    </form>
  );
}
