import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MINUTE_MS = 60000;

export function relativeTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const then = typeof value === "number" ? value : new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  if (diff < MINUTE_MS) return "방금 전";
  if (diff < 60 * MINUTE_MS) return Math.floor(diff / MINUTE_MS) + "분 전";
  if (diff < 24 * 60 * MINUTE_MS) return Math.floor(diff / (60 * MINUTE_MS)) + "시간 전";
  if (diff < 7 * 24 * 60 * MINUTE_MS) return Math.floor(diff / (24 * 60 * MINUTE_MS)) + "일 전";
  const date = new Date(then);
  return (date.getMonth() + 1) + ". " + date.getDate() + ".";
}
