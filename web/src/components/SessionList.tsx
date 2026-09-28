import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectInfo, SessionInfo } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

interface SessionListProps {
  sessions: SessionInfo[];
  projects: ProjectInfo[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
}

export function SessionList({ sessions, projects, activeId, loading, onSelect }: SessionListProps) {
  if (loading && sessions.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }
  if (sessions.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm leading-relaxed text-muted-foreground">
        표시할 세션이 없습니다.
        <br />
        Aside에서 새 세션을 시작하면 여기에 나타납니다.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1 p-2">
      {sessions.map((session) => {
        const active = session.id === activeId;
        const projectName = projects.find((project) => project.id === session.projectId)?.name ?? null;
        return (
          <li key={session.id}>
            <button
              type="button"
              onClick={() => onSelect(session.id)}
              className={cn(
                "w-full rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:bg-accent",
                active && "border-border bg-accent",
              )}
            >
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{session.title || session.id}</span>
                {session.status !== "idle" && session.status !== "unknown" ? (
                  <StatusBadge status={session.status} suspension={session.suspension} />
                ) : null}
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                {projectName ? (
                  <span className="max-w-24 truncate rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{projectName}</span>
                ) : null}
                <span className="truncate">{relativeTime(session.updatedAt)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
