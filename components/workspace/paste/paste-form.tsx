"use client";

import { useRef, useState } from "react";
import { ImageIcon, LoaderCircleIcon, SearchIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { imageFromDataTransfer } from "./image-reader";

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded border border-border bg-muted px-1 py-px font-sans text-[11px]">{children}</kbd>
);

/**
 * The "Paste text or image" box: a customer's message, or a prescription /
 * lab-request image (uploaded, pasted or dropped). Read only when the agent
 * asks — Find tests or Enter — not on every keystroke.
 */
export function PasteForm({
  value,
  onChange,
  onSubmit,
  finding,
  image,
}: {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  /** The pasted message is being read. */
  finding: boolean;
  image: {
    preview: string | null;
    reading: boolean;
    handleImage: (image: File) => void;
    clearImage: () => void;
  };
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const canSubmit = Boolean(value.trim()) && !finding;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit();
      }}
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes("Files")) return;
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        setDragOver(false);
        const dropped = imageFromDataTransfer(event.dataTransfer);
        if (!dropped) return;
        event.preventDefault();
        image.handleImage(dropped);
      }}
      className="flex flex-col gap-2.5 avm-fade-up [animation-duration:.35s]"
    >
      <div className="relative">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onPaste={(event) => {
            const pasted = imageFromDataTransfer(event.clipboardData);
            if (!pasted) return;
            event.preventDefault();
            image.handleImage(pasted);
          }}
          onKeyDown={(event) => {
            // Enter searches; Shift+Enter is a new line (not mid IME composition).
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (canSubmit) onSubmit();
            }
          }}
          placeholder="Paste the customer's message or a prescription image, e.g. “Hi, how much for vit d, b12 and a sugar test?”"
          aria-label="Customer message"
          autoFocus
          className={cn(
            "min-h-28 w-full resize-y rounded-[14px] border border-input bg-card px-4 py-3.5 text-[14.5px] leading-relaxed outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/80 focus:border-primary focus:ring-4 focus:ring-primary/15",
            dragOver && "border-primary ring-4 ring-primary/15"
          )}
        />
        {dragOver ? (
          <div className="pointer-events-none absolute inset-1 grid place-items-center rounded-[11px] bg-primary/5 text-sm font-medium text-primary">
            Drop the image to read it
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            event.target.value = "";
            if (picked) image.handleImage(picked);
          }}
        />
        {image.preview ? (
          <div className="relative size-[38px] shrink-0 overflow-hidden rounded-[9px] border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img src={image.preview} alt="Uploaded image" className="size-full object-cover" />
            {image.reading ? (
              <div className="absolute inset-0 grid place-items-center bg-background/70">
                <LoaderCircleIcon className="size-4 animate-spin text-primary" />
              </div>
            ) : (
              <button
                type="button"
                aria-label="Remove image"
                onClick={image.clearImage}
                className="absolute top-0 right-0 grid size-4 place-items-center rounded-bl-md bg-background/85 text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={image.reading}
          className="flex h-[38px] items-center gap-2 rounded-[11px] border border-border bg-card px-3.5 text-[13.5px] font-medium transition-[transform,translate,scale,rotate,border-color] duration-200 hover:-translate-y-px hover:border-primary active:scale-[0.97] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {image.reading ? <LoaderCircleIcon className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
          {image.reading ? "Reading image…" : "Upload image"}
        </button>
        <span className="mr-auto" />
        <span className="text-xs text-muted-foreground max-md:hidden">
          <Kbd>Enter</Kbd> to search · <Kbd>Shift</Kbd> + <Kbd>Enter</Kbd> new line
        </span>
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex h-[38px] items-center gap-2 rounded-[11px] bg-primary px-4 text-[13.5px] font-medium text-primary-foreground transition-[transform,translate,scale,rotate,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_8px_20px_-10px_var(--primary)] active:scale-[0.97] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {finding ? <LoaderCircleIcon className="size-4 animate-spin" /> : <SearchIcon className="size-4" />}
          {finding ? "Finding…" : "Find tests"}
        </button>
      </div>
    </form>
  );
}
