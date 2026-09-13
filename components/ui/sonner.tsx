"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      position="bottom-center"
      style={
        {
          // A fixed dark pill regardless of light/dark theme, matching the
          // Modern Workspace redesign's toast treatment.
          "--normal-bg": "oklch(0.27 0.02 275)",
          "--normal-text": "oklch(0.97 0.005 85)",
          "--normal-border": "transparent",
          "--border-radius": "999px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast px-5 py-3.5 shadow-lg",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
