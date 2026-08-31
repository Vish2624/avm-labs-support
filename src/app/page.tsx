import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const sections = [
  {
    href: "/workspace",
    title: "Support Workspace",
    description: "Search tests, check pricing/TAT/availability, build a quotation, generate a WhatsApp reply.",
  },
  {
    href: "/profiles",
    title: "Profile Search",
    description: "Find profiles/packages by name or by the tests they contain.",
  },
  {
    href: "/admin",
    title: "Admin",
    description: "Manage price lists, tests, aliases, profiles, and import history.",
  },
];

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">AVM Labs Support Assistant</h1>
        <p className="text-muted-foreground text-sm">
          Internal tool for the AVM Labs WhatsApp support team.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3 w-full max-w-4xl">
        {sections.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardHeader>
                <CardTitle>{s.title}</CardTitle>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
