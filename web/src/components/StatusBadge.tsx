import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  idle: { label: "대기", className: "bg-secondary text-secondary-foreground" },
  running: { label: "실행 중", className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400" },
  interrupted: { label: "인터럽", className: "border-orange-500/30 bg-orange-500/15 text-orange-400" },
  error: { label: "오류", className: "border-red-500/30 bg-red-500/15 text-red-400" },
  suspended: { label: "승인 대기", className: "border-amber-500/30 bg-amber-500/15 text-amber-400" },
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
