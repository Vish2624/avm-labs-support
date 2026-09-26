"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"

// Icon in a soft tinted circle, coloured by toast type.
function ToastIcon({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={cn("flex size-7 items-center justify-center rounded-full [&>svg]:size-4", className)}>
      {children}
    </span>
  )
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Top centre, just under the header — clear of the quotation's Copy
      // reply button and the package bar along the bottom.
      position="top-center"
      offset={{ top: 100 }}
      mobileOffset={{ top: 72 }}
      // Stacked toasts are shown in full, not tucked behind each other.
      expand
      duration={5000}
      visibleToasts={3}
      gap={10}
      closeButton
      icons={{
        success: (
          <ToastIcon className="bg-success text-white">
            <CircleCheckIcon />
          </ToastIcon>
        ),
        info: (
          <ToastIcon className="bg-primary text-primary-foreground">
            <InfoIcon />
          </ToastIcon>
        ),
        warning: (
          <ToastIcon className="bg-warning text-[oklch(0.3_0.06_70)]">
            <TriangleAlertIcon />
          </ToastIcon>
        ),
        error: (
          <ToastIcon className="bg-destructive text-white">
            <OctagonXIcon />
          </ToastIcon>
        ),
        loading: (
          <ToastIcon className="bg-muted text-muted-foreground">
            <Loader2Icon className="animate-spin" />
          </ToastIcon>
        ),
      }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--card-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "14px",
          "--width": "380px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "cn-toast !items-start gap-3 !border-[1.5px] px-4 py-3.5 shadow-[0_10px_30px_-10px_oklch(0.2_0.02_258/0.28),0_2px_6px_oklch(0.2_0.02_258/0.06)]",
          icon: "!m-0 !size-7 shrink-0",
          content: "min-w-0 gap-0.5 pt-[3px] pr-3",
          title: "text-[13.5px] font-semibold leading-snug",
          description: "!text-muted-foreground text-[12.5px] leading-relaxed",
          // Each type gets a tinted card, a coloured border and a coloured
          // title, so success / warning / error read at a glance.
          success:
            "!bg-[color-mix(in_oklch,var(--success)_14%,var(--card))] !border-success/50 [&_[data-title]]:!text-success-foreground",
          info: "!bg-[color-mix(in_oklch,var(--primary)_12%,var(--card))] !border-primary/45 [&_[data-title]]:!text-primary",
          warning:
            "!bg-[color-mix(in_oklch,var(--warning)_22%,var(--card))] !border-warning [&_[data-title]]:!text-warning-foreground",
          error:
            "!bg-[color-mix(in_oklch,var(--destructive)_12%,var(--card))] !border-destructive/50 [&_[data-title]]:!text-destructive",
          default: "!border-primary/35",
          closeButton:
            "!left-auto !right-2 !top-2 !translate-x-0 !translate-y-0 !border-0 !bg-transparent !text-muted-foreground hover:!bg-muted hover:!text-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
