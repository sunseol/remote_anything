import type { CSSProperties } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const toasterStyle = {
  "--normal-bg": "var(--card)",
  "--normal-text": "var(--foreground)",
  "--normal-border": "var(--border)",
} as CSSProperties

export function Toaster(props: ToasterProps) {
  return <Sonner theme="dark" className="toaster group" style={toasterStyle} {...props} />
}
