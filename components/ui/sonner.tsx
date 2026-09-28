"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// Minimal notifications: a small card with one coloured icon and a short
// line of text — no tinted background, no close button (they fade out on
// their own, or swipe them away).
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Top centre, just under the header — clear of the quotation's Copy
      // reply button and the package bar along the bottom.
      position="top-center"
      offset={{ top: 84 }}
      mobileOffset={{ top: 64 }}
      duration={3000}
      visibleToasts={3}
      gap={6}
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-primary" />,
        warning: <TriangleAlertIcon className="size-4 text-warning-foreground" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin text-muted-foreground" />,
      }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--card-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "10px",
          "--width": "300px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "cn-toast !items-start gap-2 !px-3 !py-2 shadow-[0_6px_18px_-8px_oklch(0.2_0.02_258/0.25)]",
          icon: "!m-0 !size-4 shrink-0 !mt-px",
          content: "min-w-0 gap-0",
          title: "text-[12.5px] font-medium leading-snug",
          description: "!text-muted-foreground text-[11.5px] leading-snug line-clamp-2",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
