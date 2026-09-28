import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { READER_MODELS, geminiGenerate, geminiReaderConfigured } from "@/lib/ai/gemini";

/** Vercel caps a request body at ~4.5 MB; the client shrinks images well below this first. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const PROMPT = `This image is a doctor's prescription, a lab request form, or a screenshot of a customer's message to a diagnostic lab. It is often handwritten.
List ONLY the lab tests, test profiles and health packages it asks for — one per line.
Write each one the way a lab would name it, fixing handwriting and spelling ("Lipid profile", "Urine micro albumin", "Free T4", "HbA1c"). Split combined items into separate lines ("Vit D + B12" -> "Vitamin D" and "Vitamin B12"; "RFT, LFT" -> two lines).
Leave out everything else: patient and doctor names, dates, ages, addresses, phone numbers, hospital details, stamps, signatures, diagnoses and medicines.
If a word can't be read, leave it out rather than guessing. If there are no tests, reply with nothing.
Reply with the list only — no numbering, bullets, headings or explanations.`;

// Image reader for the Support Workspace's "Paste text or image" tab.
// Gemini (free-tier key, GEMINI_API_KEY) reads the image — handwriting too —
// and returns only the requested test/package names; the client then runs
// them through /api/search/extract like pasted text, so prices and matches
// still come only from the DB. Without the key this answers 501 and the
// client uses the free in-browser reader (components/workspace/image-reader.ts).
// Note: the image is sent to Google.
export async function POST(request: NextRequest) {
  await requireUser();

  if (!geminiReaderConfigured("image")) {
    return NextResponse.json({ error: "Image AI is not configured" }, { status: 501 });
  }

  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  if (!(image instanceof Blob) || !image.type.startsWith("image/")) {
    return NextResponse.json({ error: "An image file is required" }, { status: 400 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "That image is too large." }, { status: 413 });
  }

  const data = Buffer.from(await image.arrayBuffer()).toString("base64");
  const text = await geminiGenerate(
    [{ inline_data: { mime_type: image.type, data } }, { text: PROMPT }],
    READER_MODELS,
    "image"
  );
  if (text === null) {
    return NextResponse.json({ error: "Image AI request failed" }, { status: 502 });
  }
  return NextResponse.json({ text });
}
