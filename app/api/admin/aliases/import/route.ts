import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { recordAuditLog } from "@/lib/database/audit-log";
import { ExcelParseError } from "@/lib/excel/parse-excel";
import { commitAliasImport, planAliasImport } from "@/lib/imports/import-aliases";

// Bulk alias import from a test-catalog workbook ("Test Code" + "Aliases"
// columns). mode=preview only reports what would change; mode=commit
// re-reads the same file and inserts the new aliases. Stateless on purpose:
// nothing is staged between the two calls.
export async function POST(request: NextRequest) {
  const user = await requireAdmin();

  const formData = await request.formData();
  const file = formData.get("file");
  const mode = String(formData.get("mode") ?? "preview");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  try {
    const plan = await planAliasImport(Buffer.from(await file.arrayBuffer()));
    const summary = {
      rowCount: plan.rowCount,
      matchedTests: plan.matchedTests,
      newAliases: plan.toCreate.length,
      alreadyCovered: plan.alreadyCovered,
      unknownCodes: plan.unknownCodes,
      conflicts: plan.conflicts,
      sample: plan.toCreate.slice(0, 12).map(({ testCode, testName, alias }) => ({ testCode, testName, alias })),
    };

    if (mode !== "commit") return NextResponse.json({ summary });

    const inserted = await commitAliasImport(plan);
    await recordAuditLog({
      userId: user.id,
      action: "import_aliases",
      entity: "test_aliases",
      newValue: { filename: file.name, inserted, unknownCodes: plan.unknownCodes.length },
    });
    return NextResponse.json({ summary, inserted });
  } catch (error) {
    const status = error instanceof ExcelParseError ? 400 : 500;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}
