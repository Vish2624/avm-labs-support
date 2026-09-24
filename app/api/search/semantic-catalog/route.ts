import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { listActiveTests } from "@/lib/database/tests";
import { listActiveAliases } from "@/lib/database/aliases";
import { listActiveProfilesWithTests } from "@/lib/database/profiles";

/** Aliases folded into each test's text — enough vocabulary for the model, bounded size. */
const ALIASES_PER_TEST = 6;

// The catalog's names and aliases (no prices) for the in-browser semantic
// model (lib/search/semantic-worker.ts) to embed. Each item's `text` is what
// its meaning is compared against; the browser caches embeddings by text,
// so only new or renamed items are re-embedded.
export async function GET() {
  await requireUser();

  const [tests, aliases, profiles] = await Promise.all([
    listActiveTests(),
    listActiveAliases(),
    listActiveProfilesWithTests(),
  ]);

  const aliasesByTest = new Map<string, string[]>();
  for (const alias of aliases) {
    const list = aliasesByTest.get(alias.testId) ?? [];
    list.push(alias.alias);
    aliasesByTest.set(alias.testId, list);
  }

  const items = [
    ...tests.map((test) => ({
      kind: "test" as const,
      id: test.id,
      text: [test.officialName, test.shortName, ...(aliasesByTest.get(test.id) ?? []).sort().slice(0, ALIASES_PER_TEST)]
        .filter(Boolean)
        .join("; "),
    })),
    ...profiles.map(({ profile }) => ({ kind: "package" as const, id: profile.id, text: `${profile.name} package` })),
  ];

  return NextResponse.json({ items });
}
