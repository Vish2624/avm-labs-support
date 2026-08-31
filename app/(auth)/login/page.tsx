import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// TODO: wire up to Supabase Auth (lib/supabase/client.ts) once admin auth is
// implemented. Static form only — no submit handler yet.
export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Admin sign in</CardTitle>
          <CardDescription>AVM Labs Support Assistant</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" disabled placeholder="you@avmlabs.com" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" disabled placeholder="••••••••" />
          </div>
          <Button disabled className="w-full">
            Sign in
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
