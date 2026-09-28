import { useCallback, useEffect, useState } from "react";
import { MonitorSmartphone, Plus, RefreshCw } from "lucide-react";
import { ChatView } from "@/components/ChatView";
import { NewSessionSheet } from "@/components/NewSessionSheet";
import { PairingView } from "@/components/PairingView";
import { SessionList } from "@/components/SessionList";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { ProjectInfo, SessionInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

type Phase = "checking" | "pairing" | "ready";

function Splash() {
  return (
    <div className="flex h-dvh items-center justify-center bg-background">
      <p className="animate-pulse text-sm text-muted-foreground">Remote Anything 시작 중...</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <MonitorSmartphone className="size-7" />
      </div>
      <h2 className="text-base font-semibold">세션을 선택하세요</h2>
      <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">목록에서 Aside 세션을 열면 실시간 대화가 여기에 표시됩니다.</p>
    </div>
  );
}

function App() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.sessions();
      setSessions(data.sessions);
      api.projects().then((result) => setProjects(result.projects)).catch(() => {});
      setLoadError(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setPhase("pairing");
        return;
      }
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // 수동 새로고침: 목록 재조회 + 열려 있는 대화 스트림도 다시 연결한다.
  const refreshManual = useCallback(async () => {
    setRefreshing(true);
    setReloadKey((key) => key + 1);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  useEffect(() => {
    api.sessions()
      .then(() => setPhase("ready"))
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) setPhase("pairing");
        else setPhase("ready");
      });
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [phase, refresh]);

  if (phase === "checking") return <Splash />;
  if (phase === "pairing") {
    return (
      <PairingView
        onPaired={() => {
          setLoading(true);
          setPhase("ready");
          void refresh();
        }}
      />
    );
  }

  const selected = sessions.find((session) => session.id === selectedId) ?? null;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className={cn("w-full shrink-0 flex-col border-r border-border bg-card/30 md:flex md:w-80", selectedId ? "hidden" : "flex")}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold">Remote Anything</h1>
            <p className="truncate text-xs text-muted-foreground">컴퓨터의 라이브 세션</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setNewSessionOpen(true)} aria-label="새 세션">
              <Plus className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => void refreshManual()} aria-label="세션 목록 새로고침">
              <RefreshCw className={cn("size-4", (loading || refreshing) && "animate-spin")} />
            </Button>
          </div>
        </div>
        {loadError ? (
          <p className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
            세션 목록을 가져오지 못했습니다. 잠시 후 자동으로 재시도합니다.
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <SessionList sessions={sessions} projects={projects} activeId={selectedId} loading={loading} onSelect={setSelectedId} />
        </div>
        <NewSessionSheet
          open={newSessionOpen}
          projects={projects}
          onClose={() => setNewSessionOpen(false)}
          onProjectCreated={(project) => setProjects((currentList) => (currentList.some((item) => item.id === project.id) ? currentList : [...currentList, project]))}
          onCreated={(sessionId) => {
            setNewSessionOpen(false);
            void refresh().then(() => setSelectedId(sessionId));
          }}
        />
      </aside>
      <main className={cn("min-w-0 flex-1 flex-col md:flex", selectedId ? "flex" : "hidden")}>
        {selected ? (
          <ChatView
            session={selected}
            projectName={projects.find((project) => project.id === selected.projectId)?.name ?? null}
            onBack={() => setSelectedId(null)}
            reloadKey={reloadKey}
          />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}

export default App;
