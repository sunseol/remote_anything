import { useEffect, useState } from "react";
import { FolderPlus, Loader2, Plus, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import type { ProjectInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NewSessionSheetProps {
  open: boolean;
  projects: ProjectInfo[];
  onClose: () => void;
  onCreated: (sessionId: string) => void;
  onProjectCreated: (project: ProjectInfo) => void;
}

export function NewSessionSheet({ open, projects, onClose, onProjectCreated, onCreated }: NewSessionSheetProps) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProjectId(null);
    setDraft("");
    setCreatingProject(false);
    setNewProjectName("");
    setError(null);
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const createProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setError(null);
    try {
      const result = await api.createProject(name);
      onProjectCreated(result.project);
      setProjectId(result.project.id);
      setCreatingProject(false);
      setNewProjectName("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("newSession.projectFailed"));
    }
  };

  const start = async () => {
    if (!draft.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.createSession(draft.trim(), projectId);
      onCreated(result.sessionId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("newSession.sessionFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={t("newSession.title")}>
      <div
        className="flex max-h-[88vh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-lg md:max-h-[75vh] md:max-w-lg md:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <SquarePen className="size-4 shrink-0 text-muted-foreground" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{t("newSession.title")}</h2>
          <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={onClose}>{t("sheet.close")}</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">{t("newSession.project")}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                projectId === null ? "border-sky-500/50 bg-sky-500/15 text-sky-400" : "border-border bg-background/60 text-muted-foreground hover:bg-accent",
              )}
              onClick={() => setProjectId(null)}
            >
              {t("newSession.noProject")}
            </button>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-colors",
                  projectId === project.id ? "border-sky-500/50 bg-sky-500/15 text-sky-400" : "border-border bg-background/60 text-muted-foreground hover:bg-accent",
                )}
                onClick={() => setProjectId(project.id)}
              >
                {project.name}
              </button>
            ))}
            <button
              type="button"
              className={cn(
                "flex items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-xs transition-colors",
                creatingProject ? "border-sky-500/50 text-sky-400" : "border-border text-muted-foreground hover:bg-accent",
              )}
              onClick={() => setCreatingProject(true)}
            >
              <Plus className="size-3" /> {t("newSession.newProject")}
            </button>
          </div>
          {creatingProject ? (
            <div className="mt-2 flex gap-1.5">
              <input
                type="text"
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void createProject(); }}
                placeholder={t("newSession.projectName")}
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background/60 px-3 text-sm outline-none focus:border-sky-500/50"
                autoFocus
              />
              <Button type="button" size="sm" className="h-9 shrink-0" disabled={!newProjectName.trim()} onClick={() => void createProject()}>
                <FolderPlus className="size-4" /> {t("newSession.create")}
              </Button>
            </div>
          ) : null}
          <p className="mt-4 text-xs font-medium text-muted-foreground">{t("newSession.firstMessage")}</p>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            placeholder={t("newSession.placeholder")}
            className="mt-1.5 resize-none bg-background/60"
          />
          {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
        </div>
        <div className="border-t border-border px-4 py-3">
          <Button type="button" className="w-full" disabled={!draft.trim() || submitting} onClick={() => void start()}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : t("newSession.start")}
          </Button>
        </div>
      </div>
    </div>
  );
}
