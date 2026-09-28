import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { locale, t } from "./i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MINUTE_MS = 60000;

export function relativeTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const then = typeof value === "number" ? value : new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  if (diff < MINUTE_MS) return t("time.justNow");
  if (diff < 60 * MINUTE_MS) return t("time.minutes", { n: Math.floor(diff / MINUTE_MS) });
  if (diff < 24 * 60 * MINUTE_MS) return t("time.hours", { n: Math.floor(diff / (60 * MINUTE_MS)) });
  if (diff < 7 * 24 * 60 * MINUTE_MS) return t("time.days", { n: Math.floor(diff / (24 * 60 * MINUTE_MS)) });
  return new Date(then).toLocaleDateString(locale, { month: "numeric", day: "numeric" });
}
