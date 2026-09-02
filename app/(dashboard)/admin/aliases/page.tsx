import { listAllTests } from "@/lib/database/tests";
import { AliasesClient } from "@/components/admin/aliases/aliases-client";

// Aliases — Manage alternative/misspelled/customer terminology mapped to
// AVM tests.
export default async function AliasesPage() {
  const tests = await listAllTests();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Aliases</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Curate alternative/misspelled/customer terminology mapped to catalog tests.
        </p>
      </div>

      <AliasesClient tests={tests} />
    </div>
  );
}
