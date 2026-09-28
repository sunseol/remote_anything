import { useEffect, useMemo, useState } from "react";
import { Cpu, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

interface ModelEntry {
  id: string;
  name: string;
  reasoning: boolean;
  contextWindow: number | null;
  thinkingLevelMap: Record<string, string | null> | null;
}

interface ProviderGroup {
  provider: string;
  name: string;
  models: ModelEntry[];
}

interface ModelConfig {
  provider: string;
  modelId: string;
  thinkingLevel: string;
  fastMode: boolean;
}

const ALL_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

interface ModelSheetProps {
  sessionId: string;
  open: boolean;
  onClose: () => void;
  onUpdated: (model: ModelConfig) => void;
}

export function ModelSheet({ sessionId, open, onClose, onUpdated }: ModelSheetProps) {
  const [groups, setGroups] = useState<ProviderGroup[] | null>(null);
  const [selected, setSelected] = useState<{ provider: string; modelId: string } | null>(null);
  const [thinkingLevel, setThinkingLevel] = useState("high");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setGroups(null);
    setSelected(null);
    setError(null);
    let cancelled = false;
    Promise.all([api.sessionModel(sessionId), api.models(sessionId)])
      .then(([modelData, catalog]) => {
        if (cancelled) return;
        setGroups(catalog.providers);
        if (modelData.model) {
          setSelected({ provider: modelData.model.provider, modelId: modelData.model.modelId });
          setThinkingLevel(modelData.model.thinkingLevel ?? "high");
        }
      })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : t("model.loadFailed")); });
    return () => { cancelled = true; };
  }, [open, sessionId]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const selectedEntry = useMemo(
    () => groups?.find((g) => g.provider === selected?.provider)?.models.find((m) => m.id === selected?.modelId) ?? null,
    [groups, selected],
  );

  const levelDisabled = (level: string) => {
    const map = selectedEntry?.thinkingLevelMap;
    if (!map || !(level in map)) return false;
    return map[level] === null;
  };

  if (!open) return null;

  const apply = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await api.setSessionModel(sessionId, {
        provider: selected.provider,
        modelId: selected.modelId,
        thinkingLevel,
        fastMode: false,
      });
      onUpdated({ provider: selected.provider, modelId: selected.modelId, thinkingLevel, fastMode: false });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("model.changeFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={t("model.title")}>
      <div
        className="flex max-h-[88vh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-lg md:max-h-[75vh] md:max-w-lg md:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Cpu className="size-4 shrink-0 text-muted-foreground" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{t("model.title")}</h2>
          <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={onClose}>{t("sheet.close")}</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {groups === null && !error ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t("model.loading")}
            </div>
          ) : null}
          {error ? <p className="py-10 text-center text-sm text-red-400">{error}</p> : null}
          {groups !== null ? groups.map((group) => (
            <div key={group.provider} className="mb-4">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.name}</p>
              <div className="flex flex-col gap-1">
                {group.models.map((model) => {
                  const active = selected?.provider === group.provider && selected?.modelId === model.id;
                  return (
                    <button
                      key={group.provider + "/" + model.id}
                      type="button"
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                        active
                          ? "border-sky-500/50 bg-sky-500/10"
                          : "border-border/60 bg-background/40 hover:border-sky-500/40 hover:bg-accent",
                      )}
                      onClick={() => setSelected({ provider: group.provider, modelId: model.id })}
                    >
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-sm", active ? "font-medium text-sky-400" : "font-medium")}>{model.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{model.id}</span>
                      </span>
                      {model.contextWindow ? <span className="shrink-0 text-[11px] text-muted-foreground">{Math.round(model.contextWindow / 1000)}k</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )) : null}
        </div>
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">{t("model.thinkingDepth")}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ALL_LEVELS.map((level) => {
              const disabled = levelDisabled(level);
              const active = thinkingLevel === level;
              return (
                <button
                  key={level}
                  type="button"
                  disabled={disabled}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    disabled
                      ? "border-border/40 text-muted-foreground/40 line-through"
                      : active
                        ? "border-sky-500/50 bg-sky-500/15 text-sky-400"
                        : "border-border bg-background/60 text-muted-foreground hover:bg-accent",
                  )}
                  onClick={() => setThinkingLevel(level)}
                >
                  {level}
                </button>
              );
            })}
          </div>
          <Button type="button" size="sm" className="mt-3 w-full" disabled={saving || !selected} onClick={() => void apply()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : selected ? t("model.changeTo", { model: selected.provider + "/" + selected.modelId }) : t("model.choose")}
          </Button>
        </div>
      </div>
    </div>
  );
}
