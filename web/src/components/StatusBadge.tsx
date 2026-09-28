import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  idle: { label: t("status.idle"), className: "bg-secondary text-secondary-foreground" },
  running: { label: t("status.running"), className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400" },
  interrupted: { label: t("status.interrupted"), className: "border-orange-500/30 bg-orange-500/15 text-orange-400" },
  error: { label: t("status.error"), className: "border-red-500/30 bg-red-500/15 text-red-400" },
  suspended: { label: t("status.suspended"), className: "border-amber-500/30 bg-amber-500/15 text-amber-400" },
  unknown: { label: "", className: "" },
};

export function StatusBadge({ status, suspension }: { status: string; suspension?: string | null }) {
  const entry = STATUS_STYLES[status] ?? { label: status, className: "" };
  return (
    <Badge variant="outline" className={cn("shrink-0 text-[11px] font-medium", entry.className)} title={suspension ?? undefined}>
      {entry.label}
    </Badge>
  );
}
