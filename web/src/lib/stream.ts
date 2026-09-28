import type { Envelope, SnapshotMeta } from "./types";

export type ConnectionState = "connecting" | "live" | "disconnected";

export interface StreamHandlers {
  onSnapshot: (lines: Envelope[], meta: SnapshotMeta) => void;
  onAppend: (lines: Envelope[]) => void;
  onStatus: (status: string) => void;
  onSuspension: (suspension: string | null) => void;
  onResync: () => void;
  onSendError: (message: string) => void;
  onState: (state: ConnectionState) => void;
}

interface ServerEvent {
  type?: string;
  bytes?: number;
  headBytes?: number;
  hasMore?: boolean;
  lines?: Envelope[];
  status?: string;
  suspension?: string | null;
  error?: string;
}

export function connectStream(
  sessionId: string,
  from: number,
  handlers: StreamHandlers,
): { close: () => void } {
  let source: EventSource | null = null;
  let cursor = from;
  let closed = false;
  let retryTimer: number | null = null;

  const open = () => {
    if (closed) return;
    handlers.onState("connecting");
    source = new EventSource("/api/events?session=" + encodeURIComponent(sessionId) + "&from=" + cursor + (from === 0 ? "&tail=98304" : ""));
    source.onopen = () => {
      if (!closed) handlers.onState("live");
    };
    source.onmessage = (message) => {
      let event: ServerEvent;
      try {
        event = JSON.parse(message.data) as ServerEvent;
      } catch {
        return;
      }
      if (event.type === "snapshot") {
        if (typeof event.bytes === "number") cursor = event.bytes;
        handlers.onSnapshot(event.lines ?? [], {
          headBytes: typeof event.headBytes === "number" ? event.headBytes : 0,
          hasMore: event.hasMore === true,
        });
      } else if (event.type === "append") {
        if (typeof event.bytes === "number") cursor = event.bytes;
        handlers.onAppend(event.lines ?? []);
      } else if (event.type === "resync") {
        cursor = 0;
        if (source) source.close();
        handlers.onResync();
        open();
      } else if (event.type === "status") {
        handlers.onStatus(typeof event.status === "string" ? event.status : "unknown");
        handlers.onSuspension(event.suspension ?? null);
      } else if (event.type === "sendError") {
        handlers.onSendError(typeof event.error === "string" ? event.error : "unknown error");
      }
    };
    source.onerror = () => {
      if (source) source.close();
      source = null;
      if (closed) return;
      handlers.onState("disconnected");
      retryTimer = window.setTimeout(open, 1500);
    };
  };

  open();

  return {
    close: () => {
      closed = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (source) source.close();
    },
  };
}
