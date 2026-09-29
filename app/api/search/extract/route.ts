import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { extractTests } from "@/lib/search/reading/extract-tests";
import { aiListRequestedTests } from "@/lib/search/reading/ai-read-message";
import { extractFromAiList } from "@/lib/search/reading/extract-from-ai-list";
import { geminiReaderConfigured } from "@/lib/ai/gemini";
import { isPackageName } from "@/lib/search/matching/is-package-name";
import { SERVICE_TYPES, isServiceType } from "@/lib/constants/service-types";

// Bulk test extraction backing the Support Workspace's "Paste text or image"
// tab and list-style queries in the search box ("ACCP, ALKP, AMYL, ...").
// POST, since a pasted message can be far longer than a sane query string.
export async function POST(request: NextRequest) {
  await requireUser();

  const body = (await request.json().catch(() => null)) as {
    text?: unknown;
    locationId?: unknown;
    serviceType?: unknown;
    ai?: unknown;
  } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  const locationId = typeof body?.locationId === "string" ? body.locationId : "";
  const serviceType = typeof body?.serviceType === "string" ? body.serviceType : "";

  if (!locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }
  const serviceTypes = serviceType === "all" ? SERVICE_TYPES : isServiceType(serviceType) ? [serviceType] : null;
  if (!serviceTypes) {
    return NextResponse.json({ error: "serviceType must be all, in_house or outsource" }, { status: 400 });
  }
  if (text.length > 20_000) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }

  // The rule-based reader first: a plain list it matches exactly and
  // completely ("TSH, FT4, HBA" — e.g. codes sent over from the Support
  // Assistant) needs no Gemini request at all.
  const rules = await extractTests(text, locationId, serviceTypes);
  const readCleanly =
    rules.unmatched.length === 0 &&
    rules.notOffered.length === 0 &&
    rules.detected.length + rules.packages.length > 0 &&
    rules.detected.every((result) => result.matchType === "exact");
  // A clean list of exact codes keeps any package in it (e.g. one the
  // agent ticked in the Support Assistant); anything read from a message
  // never shows packages — tests and profiles only.
  if (readCleanly) return NextResponse.json({ ...rules, readBy: "rules" });
  const withoutPackages = (packages: typeof rules.packages) =>
    packages.filter(({ result }) => !isPackageName(result.name));

  // ai=true (the paste tab): otherwise Gemini picks the catalog codes the
  // message asks for (lib/search/reading/ai-read-message.ts), then the usual reader
  // prices them. Without a key, or if Gemini fails or finds nothing, the
  // rule-based reading stands.
  if (body?.ai === true && geminiReaderConfigured()) {
    const aiList = await aiListRequestedTests(text, locationId, serviceTypes).catch(() => null);
    if (aiList && (aiList.codes || aiList.notListed.length > 0)) {
      const result = await extractFromAiList(aiList, locationId, serviceTypes);
      return NextResponse.json({ ...result, readBy: "ai" });
    }
  }

  return NextResponse.json({ ...rules, packages: withoutPackages(rules.packages), readBy: "rules" });
}
