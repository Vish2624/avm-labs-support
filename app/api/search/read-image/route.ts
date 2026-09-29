import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { geminiReaderConfigured } from "@/lib/ai/gemini";
import { aiReadImageTests } from "@/lib/search/reading/ai-read-message";
import { extractFromAiList } from "@/lib/search/reading/extract-from-ai-list";
import { SERVICE_TYPES, isServiceType } from "@/lib/constants/service-types";

/** Vercel caps a request body at ~4.5 MB; the client shrinks images well below this first. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// Image reader for the Support Workspace's "Paste text or image" tab.
// One Gemini request (free-tier key, GEMINI_API_KEY_IMAGE) reads the image —
// handwriting too — and picks the catalog codes it asks for; they are priced
// here straight away, so the reply carries both the text for the paste box
// and the finished results (no second request). Prices and matches still
// come only from the DB. Without a key this answers 501 and the client uses
// the free in-browser reader (components/workspace/paste/image-reader.ts).
// Note: the image is sent to Google.
export async function POST(request: NextRequest) {
  await requireUser();

  if (!geminiReaderConfigured("image")) {
    return NextResponse.json({ error: "Image AI is not configured" }, { status: 501 });
  }

  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  const locationId = form?.get("locationId");
  const serviceType = form?.get("serviceType");
  if (!(image instanceof Blob) || !image.type.startsWith("image/")) {
    return NextResponse.json({ error: "An image file is required" }, { status: 400 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "That image is too large." }, { status: 413 });
  }
  if (typeof locationId !== "string" || !locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }
  const serviceTypes =
    serviceType === "all" ? SERVICE_TYPES : typeof serviceType === "string" && isServiceType(serviceType) ? [serviceType] : null;
  if (!serviceTypes) {
    return NextResponse.json({ error: "serviceType must be all, in_house or outsource" }, { status: 400 });
  }

  const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
  const aiList = await aiReadImageTests({ mimeType: image.type, base64 }, locationId, serviceTypes).catch(() => null);
  if (aiList === null) {
    return NextResponse.json({ error: "Image AI request failed" }, { status: 502 });
  }

  const extraction = await extractFromAiList(aiList, locationId, serviceTypes);
  // What the paste box shows: the tests read, by their catalog names, then
  // anything asked for that isn't offered, as read.
  const text = [
    ...extraction.detected.map((result) => result.officialName),
    ...extraction.packages.map(({ result }) => result.name),
    ...extraction.notOffered.map((test) => test.officialName),
    ...extraction.unmatched,
  ]
    .filter((line, i, all) => all.indexOf(line) === i)
    .join("\n");

  return NextResponse.json({ text, extraction: { ...extraction, readBy: "ai" } });
}
