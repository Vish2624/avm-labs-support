import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[38rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
      />
      <Card className="w-full max-w-sm border-glass-border bg-glass shadow-glass backdrop-blur-sm">
        <CardHeader>
          <div className="mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, no benefit from next/image */}
            <img
              src="/logo/avm-labs-logo-full.svg"
              alt="AVM Labs — Wellness Laboratory"
              className="h-auto w-28"
            />
          </div>
          <CardTitle className="text-lg">Sign in</CardTitle>
          <CardDescription>Support Assistant — internal use only</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
