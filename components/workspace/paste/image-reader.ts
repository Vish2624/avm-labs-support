"use client";

// Reads prescription / lab-request photos and screenshots for "Paste text
// or image". First choice: /api/search/read-image, where Gemini (free-tier
// key) reads the image — handwriting too — and returns only the test names
// (the image is sent to Google). If the server has no key or the call
// fails, free in-browser OCR runs instead: Tesseract.js (open source),
// loaded once from jsDelivr; its English data (~10 MB) is fetched on first
// use and then cached. Tesseract reads printed text well, handwriting
// poorly. Either way the text goes through the same reader as pasted text,
// so only real catalog tests and packages with a price here are shown.

const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
/**
 * Images are resized to about this width before reading: small screenshots
 * are enlarged (Tesseract reads ~30px-tall letters best) and big phone
 * photos (often 4000px+) are shrunk, which makes reading several times
 * faster with no loss in accuracy.
 */
const TARGET_WIDTH = 2000;
/** Never enlarge more than this, or blur gets magnified too. */
const MAX_UPSCALE = 3;

interface TesseractWorker {
  recognize(image: Blob | HTMLCanvasElement): Promise<{ data: { text: string } }>;
}
interface TesseractGlobal {
  createWorker(lang: string): Promise<TesseractWorker>;
}

let workerPromise: Promise<TesseractWorker> | null = null;

function loadScript(): Promise<TesseractGlobal> {
  const existing = (window as unknown as { Tesseract?: TesseractGlobal }).Tesseract;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TESSERACT_URL;
    script.async = true;
    script.onload = () => {
      const loaded = (window as unknown as { Tesseract?: TesseractGlobal }).Tesseract;
      if (loaded) resolve(loaded);
      else reject(new Error("Image reader failed to load"));
    };
    script.onerror = () => reject(new Error("Image reader failed to load — check the internet connection"));
    document.head.appendChild(script);
  });
}

function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = loadScript().then((tesseract) => tesseract.createWorker("eng"));
    // A failed load can be retried on the next image.
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

/**
 * Cleans an image up for OCR: enlarges small photos/screenshots, turns it
 * grey and stretches the contrast so faint or coloured text (blue pen,
 * WhatsApp bubbles) reads as dark-on-light. Null if the browser can't
 * decode it — the original is read as-is then.
 */
async function prepareImage(image: Blob): Promise<HTMLCanvasElement | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(image);
  } catch {
    return null;
  }
  const scale = Math.min(MAX_UPSCALE, TARGET_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  const grey = new Uint8ClampedArray(data.length / 4);
  const histogram = new Uint32Array(256);
  for (let i = 0; i < grey.length; i++) {
    const value = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    grey[i] = value;
    histogram[value]++;
  }
  // Stretch between the 1st and 99th percentile of brightness.
  const cut = grey.length * 0.01;
  let low = 0;
  for (let sum = 0; low < 255 && sum + histogram[low] <= cut; low++) sum += histogram[low];
  let high = 255;
  for (let sum = 0; high > 0 && sum + histogram[high] <= cut; high--) sum += histogram[high];
  const range = Math.max(1, high - low);
  // Dark-mode screenshots (light text on dark) are flipped to dark-on-light.
  let total = 0;
  for (let i = 0; i < grey.length; i++) total += grey[i];
  const invert = total / grey.length < 110;
  for (let i = 0; i < grey.length; i++) {
    let value = ((grey[i] - low) * 255) / range;
    if (invert) value = 255 - value;
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = value;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

/**
 * Starts loading the reader (script, engine and English data) in the
 * background, so the first image doesn't wait for the download — called
 * when the agent opens "Paste text or image". Safe to call repeatedly.
 */
export function preloadImageReader(): void {
  // Only needed when the server can't read images itself.
  if (!serverReaderMissing) return;
  getWorker().catch(() => {
    // Reported when an image is actually read.
  });
}

/** Longest side of the copy sent to the server — plenty for handwriting, and small to upload. */
const UPLOAD_MAX_SIDE = 1600;

/** A JPEG copy of the image, no bigger than UPLOAD_MAX_SIDE (the original if it can't be decoded). */
async function shrinkForUpload(image: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(image);
    const scale = Math.min(1, UPLOAD_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return image;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    return blob ?? image;
  } catch {
    return image;
  }
}

/** Set once the server says it has no image AI, so later images skip the round trip. */
let serverReaderMissing = false;

/** The server's AI reader: the test names it found, or null when it isn't set up or failed. */
async function readWithServer(image: Blob): Promise<string | null> {
  if (serverReaderMissing) return null;
  const form = new FormData();
  form.append("image", await shrinkForUpload(image), "image.jpg");
  try {
    const response = await fetch("/api/search/read-image", { method: "POST", body: form });
    if (response.status === 501) serverReaderMissing = true;
    if (!response.ok) return null;
    const { text } = (await response.json()) as { text?: unknown };
    return typeof text === "string" ? text.trim() : null;
  } catch {
    return null;
  }
}

/** The first image in a paste/drop, if any. */
export function imageFromDataTransfer(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) return item.getAsFile();
  }
  return Array.from(data.files ?? []).find((file) => file.type.startsWith("image/")) ?? null;
}

/** Reads the tests named in an image. Throws when no reader can load or run. */
export async function readImageText(image: Blob): Promise<string> {
  const fromServer = await readWithServer(image);
  if (fromServer !== null) return fromServer;

  const [worker, prepared] = await Promise.all([getWorker(), prepareImage(image)]);
  const { data } = await worker.recognize(prepared ?? image);
  return data.text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
