import { useEffect, useState } from "react";
import { Bot, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { SubagentInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  idle: { label: t("status.done"), className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400" },
  running: { label: t("status.running"), className: "border-sky-500/30 bg-sky-500/15 text-sky-400" },
  interrupted: { label: t("status.interrupted"), className: "border-orange-500/30 bg-orange-500/15 text-orange-400" },
  error: { label: t("status.error"), className: "border-red-500/30 bg-red-500/15 text-red-400" },
};

interface SubagentModalProps {
  sessionId: string;
  open: boolean;
  onClose: () => void;
}

export function SubagentModal({ sessionId, open, onClose }: SubagentModalProps) {
  const [agents, setAgents] = useState<SubagentInfo[] | null>(null);
  const [selected, setSelected] = useState<SubagentInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setAgents(null);
      setError(null);
      return;
    }
    let cancelled = false;
    api.subagents(sessionId)
      .then((data) => { if (!cancelled) setAgents(data.agents); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : t("subagents.loadFailed")); });
    return () => { cancelled = true; };
  }, [open, sessionId]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={t("subagents.title")}>
      <div
        className="flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-lg md:max-h-[70vh] md:max-w-lg md:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          {selected ? (
            <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setSelected(null)} aria-label={t("subagents.backToList")}>
              <ChevronLeft className="size-4" />
            </Button>
          ) : (
            <Bot className="size-4 shrink-0 text-muted-foreground" />
          )}
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
            {selected ? selected.description || selected.taskId || t("subagents.title") : t("subagents.title")}
          </h2>
          <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={onClose}>{t("sheet.close")}</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {agents === null && !error ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t("subagents.loading")}
            </div>
          ) : null}
          {error ? <p className="py-10 text-center text-sm text-red-400">{error}</p> : null}
          {agents !== null && !error && agents.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("subagents.empty")}</p>
          ) : null}
          {agents !== null && !error && !selected ? agents.map((agent, index) => {
            const entry = STATUS_STYLES[agent.status] ?? { label: agent.status, className: "" };
            return (
              <button
                key={(agent.taskId ?? "") + String(index)}
                type="button"
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-accent"
                onClick={() => setSelected(agent)}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{agent.description || agent.taskId || t("subagents.title")}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[agent.profile, agent.progress].filter(Boolean).join(" · ") || agent.prompt.slice(0, 60)}
                  </p>
                </div>
                <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium", entry.className)}>{entry.label}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            );
          }) : null}
          {selected ? (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t("subagents.status")}</p>
                <p className="mt-1 text-sm">{STATUS_STYLES[selected.status]?.label ?? selected.status}{selected.progress ? " · " + selected.progress : null}</p>
              </div>
              {selected.taskId ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t("subagents.taskId")}</p>
                  <p className="mt-1 break-all font-mono text-xs">{selected.taskId}</p>
                </div>
              ) : null}
              {selected.profile ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t("subagents.profile")}</p>
                  <p className="mt-1 text-sm">{selected.profile}{selected.modelCategory ? " · " + selected.modelCategory : null}</p>
                </div>
              ) : null}
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t("subagents.instructions")}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{selected.prompt}</p>
              </div>
              {selected.result ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t("subagents.result")}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{selected.result}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("subagents.noResult")}</p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
