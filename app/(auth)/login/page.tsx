import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[38rem] -translate-x-1/2 rounded-full bg-primary/25 blur-[120px]"
      />
      <Card className="w-full max-w-sm border-glass-border bg-glass shadow-glass backdrop-blur-2xl">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground shadow-sm">
              AV
            </span>
            <span className="text-sm font-semibold tracking-tight">AVM Labs</span>
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
