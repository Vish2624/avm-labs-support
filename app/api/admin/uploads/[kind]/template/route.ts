import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { buildPriceListTemplate, buildProfileWorkbook, buildTestDetailsWorkbook } from "@/lib/excel/upload-templates";

// Excel template for the Price list / Test details / Profiles uploads.
// ?current=1 fills the Test details / Profiles one with the current catalog
// in the same format (the current price list is /api/exports?type=prices).
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  await requireAdmin();
  const { kind } = await params;
  if (kind === "prices") {
    return new NextResponse(await buildPriceListTemplate(), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="price-list-template.xlsx"`,
      },
    });
  }
  if (kind !== "tests" && kind !== "profiles") {
    return NextResponse.json({ error: "Unknown upload type" }, { status: 404 });
  }
  const filled = new URL(request.url).searchParams.get("current") === "1";
  const buffer = kind === "tests" ? await buildTestDetailsWorkbook(filled) : await buildProfileWorkbook(filled);
  const name = `${kind === "tests" ? "test-details" : "profiles"}-${filled ? "current" : "template"}.xlsx`;
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
