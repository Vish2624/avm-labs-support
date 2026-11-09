"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ServiceTypeFilter } from "@/lib/constants/service-types";
import { primeExtraction } from "./message-extractor";
import { readImage } from "./image-reader";

/**
 * Prescription / lab-request image reader (image-reader.ts): an uploaded,
 * pasted or dropped image is read and its text goes through the same reader
 * as a pasted message (`onText`).
 */
export function useImagePaste({
  locationId,
  serviceType,
  onStart,
  onText,
}: {
  locationId: string;
  serviceType: ServiceTypeFilter;
  /** Called as soon as an image is accepted (e.g. to open the paste tab). */
  onStart: () => void;
  /** The text read from the image. */
  onText: (text: string) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  function replacePreview(next: string | null) {
    setPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return next;
    });
  }

  async function handleImage(image: File) {
    if (reading) return;
    onStart();
    replacePreview(URL.createObjectURL(image));
    setReading(true);
    try {
      const { text, extraction } = await readImage(image, { locationId, serviceType });
      if (!text) {
        toast.error("No tests found in image");
        return;
      }
      // The AI reader priced the tests already — show them without asking again.
      if (extraction) primeExtraction(text, locationId, serviceType, true, extraction);
      onText(text);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't read that image");
    } finally {
      setReading(false);
    }
  }

  return { preview, reading, handleImage, clearImage: () => replacePreview(null) };
}
