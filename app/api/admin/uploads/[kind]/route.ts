import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { recordAuditLog } from "@/lib/database/audit-log";
import { ExcelParseError } from "@/lib/excel/parse-excel";
import { applyTestDetailsUpload, previewTestDetailsUpload } from "@/lib/imports/test-details-import";
import { applyProfileUpload, previewProfileUpload } from "@/lib/imports/profile-details-import";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Test details / profile uploads (Admin → Upload). mode=preview reports
// every change without saving; mode=apply re-reads the same file and saves
// it — stateless on purpose, nothing is staged between the two calls. A
// file with any error is never applied.
export async function POST(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const user = await requireAdmin();
  const { kind } = await params;
  if (kind !== "tests" && kind !== "profiles") {
    return NextResponse.json({ error: "Unknown upload type" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const mode = String(formData.get("mode") ?? "preview");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "File is larger than 10 MB." }, { status: 400 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (mode !== "apply") {
      const preview = kind === "tests" ? await previewTestDetailsUpload(buffer) : await previewProfileUpload(buffer);
      return NextResponse.json({ preview });
    }

    const preview =
      kind === "tests"
        ? await applyTestDetailsUpload(buffer, { filename: file.name, fileSize: file.size, userId: user.id })
        : await applyProfileUpload(buffer);
    if (!preview.canApply) {
      return NextResponse.json({ preview, error: "The file has errors — nothing was saved." }, { status: 400 });
    }
    await recordAuditLog({
      userId: user.id,
      action: kind === "tests" ? "upload_test_details" : "upload_profiles",
      entity: kind === "tests" ? "tests" : "profiles",
      newValue: { filename: file.name, stats: preview.stats },
    });
    return NextResponse.json({ preview, applied: true });
  } catch (error) {
    const status = error instanceof ExcelParseError ? 400 : 500;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}
