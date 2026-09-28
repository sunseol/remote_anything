import type { HistoryPage, ProjectInfo, SessionInfo, SessionStatusInfo, SubagentInfo } from "./types";
import { t } from "./i18n";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(t("api.offline"), 0);
  }
  if (!response.ok) {
    let message = "HTTP " + response.status;
    try {
      const body = (await response.json()) as { error?: string };
      if (body && typeof body.error === "string") message = body.error;
    } catch {
      void 0;
    }
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}

export const api = {
  pair(code: string): Promise<{ ok: boolean }> {
    return request("/api/pair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
  },
  sessions(): Promise<{ sessions: SessionInfo[] }> {
    return request("/api/session");
  },
  projects(): Promise<{ projects: ProjectInfo[] }> {
    return request("/api/projects");
  },
  history(sessionId: string, beforeBytes: number | null): Promise<HistoryPage> {
    const query = beforeBytes === null ? "" : "&beforeBytes=" + beforeBytes;
    return request("/api/history?session=" + encodeURIComponent(sessionId) + query);
  },
  status(sessionId: string): Promise<SessionStatusInfo> {
    return request("/api/status?session=" + encodeURIComponent(sessionId));
  },
  send(sessionId: string, text: string, mode?: "steer" | "answer"): Promise<{ mode: string }> {
    return request("/api/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session: sessionId, text, mode }),
    });
  },
  models(sessionId: string): Promise<{ providers: { provider: string; name: string; models: { id: string; name: string; reasoning: boolean; contextWindow: number | null; thinkingLevelMap: Record<string, string | null> | null }[] }[] }> {
    return request("/api/models?session=" + encodeURIComponent(sessionId));
  },
  sessionModel(sessionId: string): Promise<{ model: { provider: string; modelId: string; thinkingLevel: string; fastMode: boolean } | null }> {
    return request("/api/model?session=" + encodeURIComponent(sessionId));
  },
  setSessionModel(sessionId: string, model: { provider: string; modelId: string; thinkingLevel: string; fastMode: boolean }): Promise<{ model: { provider: string; modelId: string; thinkingLevel: string; fastMode: boolean } }> {
    return request("/api/model", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session: sessionId, ...model }),
    });
  },
  createSession(text: string, projectId: string | null): Promise<{ sessionId: string }> {
    return request("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, projectId }),
    });
  },
  createProject(name: string): Promise<{ project: ProjectInfo }> {
    return request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
  },
  subagents(sessionId: string): Promise<{ agents: SubagentInfo[] }> {
    return request("/api/subagents?session=" + encodeURIComponent(sessionId));
  },
  attach(sessionId: string, filename: string, data: string): Promise<{ path: string; bytes: number }> {
    return request("/api/attach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session: sessionId, filename, data }),
    });
  },
  stop(sessionId: string): Promise<{ ok: boolean }> {
    return request("/api/stop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session: sessionId }),
    });
  },
};
