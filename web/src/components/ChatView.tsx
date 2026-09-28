import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ArrowLeft, Bot, ChevronUp, Cpu, ImagePlus, RefreshCw, SendHorizonal, Square, X } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";
import { ModelSheet } from "@/components/ModelSheet";
import { SubagentModal } from "@/components/SubagentModal";
import { TranscriptLine } from "@/components/TranscriptLine";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { connectStream } from "@/lib/stream";
import type { ConnectionState } from "@/lib/stream";
import { envelopeText, thinkingLabel } from "@/lib/types";
import type { Envelope, SessionInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChatViewProps {
  session: SessionInfo;
  projectName: string | null;
  onBack: () => void;
  reloadKey?: number;
}

const CONNECTION_LABELS: Record<ConnectionState, string> = {
  connecting: "연결 중...",
  live: "실시간 연결",
  disconnected: "연결 끊김 - 재시도 중",
};

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "페어링이 만료되었습니다. 페이지를 새로고침하세요.";
    return error.message;
  }
  return "알 수 없는 오류가 발생했습니다.";
}

function latestThinkingLabel(messages: Envelope[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const envelope = messages[index];
    if (envelope.role !== "assistant" || !Array.isArray(envelope.content)) continue;
    const block = envelope.content.find((item) => item.type === "thinking" && typeof item.thinking === "string");
    if (block && typeof block.thinking === "string") return thinkingLabel(block.thinking);
  }
  return null;
}

export function ChatView({ session, projectName, onBack, reloadKey = 0 }: ChatViewProps) {
  const [messages, setMessages] = useState<Envelope[]>([]);
  const [status, setStatus] = useState("unknown");
  const [suspension, setSuspension] = useState<string | null>(null);
  const [connState, setConnState] = useState<ConnectionState>("connecting");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [headBytes, setHeadBytes] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [subagentsOpen, setSubagentsOpen] = useState(false);
  const [pendingImages, setPendingImages] = useState<{ filename: string; mime: string; data: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [localReload, setLocalReload] = useState(0);
  const [reloading, setReloading] = useState(false);
  const [sessionModel, setSessionModel] = useState<{ provider: string; modelId: string; thinkingLevel: string; fastMode: boolean } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const nearBottomRef = useRef(true);
  const pendingRef = useRef<string | null>(null);
  const anchorRef = useRef<{ height: number; top: number } | null>(null);

  useEffect(() => {
    setMessages([]);
    setStatus("unknown");
    setSuspension(null);
    setConnState("connecting");
    setPendingText(null);
    setSessionModel(null);
    setHeadBytes(0);
    setHasMore(false);
    setLoadingOlder(false);
    pendingRef.current = null;
    anchorRef.current = null;
    nearBottomRef.current = true;

    let cancelled = false;
    api.status(session.id)
      .then((info) => {
        if (cancelled) return;
        setStatus(info.status);
        setSuspension(info.suspension ?? null);
      })
      .catch(() => {});

    const consumePending = (envelope: Envelope) => {
      if (envelope.role !== "user" || pendingRef.current === null) return;
      const sent = pendingRef.current;
      if (envelopeText(envelope).trim() === sent.trim()) {
        pendingRef.current = null;
        if (!cancelled) setPendingText(null);
      }
    };

    const control = connectStream(session.id, 0, {
      onSnapshot: (lines, meta) => {
        if (cancelled) return;
        setMessages(lines);
        setHeadBytes(meta.headBytes);
        setHasMore(meta.hasMore);
        setReloading(false);
      },
      onAppend: (lines) => {
        if (cancelled) return;
        setMessages((prev) => prev.concat(lines));
        for (const envelope of lines) consumePending(envelope);
      },
      onStatus: (next) => {
        if (!cancelled) setStatus(next);
      },
      onSuspension: (next) => {
        if (!cancelled) setSuspension(next);
      },
      onResync: () => {
        if (!cancelled) setMessages([]);
      },
      onSendError: (message) => {
        if (cancelled) return;
        pendingRef.current = null;
        setPendingText(null);
        toast.error("전송 오류: " + message);
      },
      onState: (state) => {
        if (!cancelled) setConnState(state);
      },
    });

    return () => {
      cancelled = true;
      control.close();
    };
  }, [session.id, reloadKey, localReload]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const anchor = anchorRef.current;
    if (anchor) {
      const delta = element.scrollHeight - anchor.height;
      element.scrollTop = anchor.top + delta;
      anchorRef.current = null;
      return;
    }
    if (nearBottomRef.current) element.scrollTop = element.scrollHeight;
  }, [messages, pendingText]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    const next = Math.min(element.scrollHeight, 160);
    if (Math.abs(element.clientHeight - next) < 1) return;
    element.style.height = "0px";
    element.style.height = next + "px";
  }, [draft]);

  const loadOlder = async () => {
    if (loadingOlder || !hasMore) return;
    const element = scrollRef.current;
    if (element) anchorRef.current = { height: element.scrollHeight, top: element.scrollTop };
    setLoadingOlder(true);
    try {
      const page = await api.history(session.id, headBytes);
      setMessages((prev) => [...page.lines, ...prev]);
      setHeadBytes(page.headBytes);
      setHasMore(page.hasMore);
    } catch (error) {
      anchorRef.current = null;
      toast.error(describeError(error));
    } finally {
      setLoadingOlder(false);
    }
  };

  const busy = status === "running" || status === "suspended";
  useEffect(() => {
    if (!session.id) return;
    let cancelled = false;
    api.sessionModel(session.id)
      .then((data) => { if (!cancelled) setSessionModel(data.model); })
      .catch(() => void 0);
    return () => { cancelled = true; };
  }, [session.id]);

  const answerableQuestionId = useMemo(() => {
    const resultIds = new Set<string>();
    for (const envelope of messages) {
      if (envelope.role === "toolResult" && typeof envelope.toolCallId === "string") resultIds.add(envelope.toolCallId);
    }
    let pending: string | null = null;
    let pendingIndex = -1;
    messages.forEach((envelope, index) => {
      const isUserTurn = envelope.role === "user" || envelope.role === "steering";
      if (isUserTurn && pendingIndex >= 0) {
        pending = null;
        pendingIndex = -1;
      }
      if (!Array.isArray(envelope.content)) return;
      for (const block of envelope.content) {
        if (block.type !== "toolCall" || block.name !== "ask_user_question") continue;
        if (typeof block.id !== "string") continue;
        if (resultIds.has(block.id)) {
          if (pending === block.id) { pending = null; pendingIndex = -1; }
          continue;
        }
        pending = block.id;
        pendingIndex = index;
      }
    });
    return pending;
  }, [messages]);

  const thinkingNow = useMemo(() => (status === "running" ? latestThinkingLabel(messages) : null), [messages, status]);

  const pickImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: { filename: string; mime: string; data: string }[] = [];
    for (const file of Array.from(files).slice(0, 4)) {
      if (!file.type.startsWith("image/")) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("읽기 실패"));
        reader.readAsDataURL(file);
      });
      const compressed = await new Promise<string>((resolve) => {
        const image = new Image();
        image.onload = () => {
          const maxDim = 1600;
          const scale = Math.min(1, maxDim / Math.max(image.width, image.height));
          if (scale >= 1 && file.size < 1024 * 1024) { resolve(dataUrl); return; }
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(image.width * scale);
          canvas.height = Math.round(image.height * scale);
          const context = canvas.getContext("2d");
          if (!context) { resolve(dataUrl); return; }
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        image.onerror = () => resolve(dataUrl);
        image.src = dataUrl;
      });
      const base64 = compressed.slice(compressed.indexOf(",") + 1);
      const mime = compressed.startsWith("data:image/") ? compressed.slice(5, compressed.indexOf(";")) : "image/jpeg";
      next.push({ filename: file.name || "image.jpg", mime, data: base64 });
    }
    if (next.length === 0) { toast.error("이미지 파일을 선택해주세요."); return; }
    setPendingImages((current) => [...current, ...next].slice(0, 4));
  };

  const sendPayload = useCallback(async (payload: string, mode?: "steer" | "answer") => {
    if (!payload || sending) return;
    setSending(true);
    nearBottomRef.current = true;
    try {
      const result = await api.send(session.id, payload, mode);
      pendingRef.current = payload;
      setPendingText(payload);
      if (mode === "steer") {
        toast.info("답변을 전달했습니다. 세션을 재개합니다.");
      } else if (result.mode === "queued") {
        toast.info("세션이 실행 중입니다. 메시지를 대기열에 추가했습니다.");
      }
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setSending(false);
    }
  }, [session.id, sending]);

  // TranscriptLine memo가 의미 있으려면 onAnswer 참조가 안정적이어야 한다.
  const answerQuestion = useCallback((text: string) => { void sendPayload(text, "answer"); }, [sendPayload]);

  const submit = async () => {
    const text = draft.trim();
    if ((!text && pendingImages.length === 0) || sending) return;
    setDraft("");
    setSending(true);
    nearBottomRef.current = true;
    try {
      let payload = text;
      if (pendingImages.length > 0) {
        const paths: string[] = [];
        for (const image of pendingImages) {
          const uploaded = await api.attach(session.id, image.filename, image.data);
          paths.push(uploaded.path);
        }
        const imageNote = paths.map((p) => "이미지 첨부: " + p).join("\n");
        const caption = text ? "\n\n" + text : "\n\n첨붐한 이미지를 확인하고 내용을 설명해 주세요.";
        payload = imageNote + caption;
        setPendingImages([]);
      }
      const result = await api.send(session.id, payload);
      pendingRef.current = payload;
      setPendingText(payload);
      if (result.mode === "queued") {
        toast.info("세션이 실행 중입니다. 메시지를 대기열에 추가했습니다.");
      }
    } catch (error) {
      setDraft(text);
      toast.error(describeError(error));
    } finally {
      setSending(false);
    }
  };

  const requestStop = async () => {
    try {
      await api.stop(session.id);
      toast("중지 요청을 보냈습니다.");
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    nearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border bg-card/40 px-3 py-2.5 md:px-5">
        <Button variant="ghost" size="icon" className="size-8 md:hidden" onClick={onBack} aria-label="세션 목록으로 돌아가기">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{session.title || session.id}</h1>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", connState === "live" ? "bg-emerald-400" : connState === "connecting" ? "bg-amber-400" : "bg-red-400")} />
            {projectName ? <span className="truncate">{projectName} · </span> : null}
            {CONNECTION_LABELS[connState]}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => { setReloading(true); setLocalReload((value) => value + 1); }} aria-label="대화 새로고침">
          <RefreshCw className={cn("size-4", reloading && "animate-spin")} />
        </Button>
        <button
          type="button"
          className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-border/60 bg-background/50 px-2 text-xs text-muted-foreground transition-colors hover:bg-accent"
          onClick={() => setModelOpen(true)}
          aria-label="모델 변경"
        >
          <Cpu className="size-3.5" />
          <span className="max-w-24 truncate">{sessionModel ? sessionModel.modelId.split("/").pop() : "모델"}</span>
        </button>
        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setSubagentsOpen(true)} aria-label="서브에이전트 보기">
          <Bot className="size-4" />
        </Button>
        <StatusBadge status={status} suspension={suspension} />
      </header>

      {status === "running" ? (
        <div className="border-b border-border bg-emerald-500/10 px-3 py-1.5 text-center text-xs text-emerald-400 md:px-5">
          실행 중 - 새 메시지는 대기열에 추가됩니다
        </div>
      ) : null}
      {status === "suspended" ? (
        <div className="border-b border-border bg-amber-500/10 px-3 py-1.5 text-center text-xs text-amber-400 md:px-5">
          승인 대기 - Aside 앱에서 승인이 필요합니다
        </div>
      ) : null}

      <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {hasMore ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mx-auto gap-1 text-xs text-muted-foreground"
              disabled={loadingOlder}
              onClick={() => void loadOlder()}
            >
              <ChevronUp className="size-3.5" />
              {loadingOlder ? "불러오는 중..." : "이전 대화 불러오기"}
            </Button>
          ) : null}
          {messages.length === 0 && pendingText === null ? (
            <p className="mt-20 text-center text-sm text-muted-foreground">아직 대화가 없습니다. 메시지를 보내보세요.</p>
          ) : null}
          {messages.map((envelope, index) => (
            <TranscriptLine key={index} envelope={envelope} answerableQuestionId={answerableQuestionId} onAnswer={answerQuestion} sessionId={session?.id ?? null} />
          ))}
      <SubagentModal sessionId={session.id} open={subagentsOpen} onClose={() => setSubagentsOpen(false)} />
      <ModelSheet sessionId={session.id} open={modelOpen} onClose={() => setModelOpen(false)} onUpdated={(model) => setSessionModel(model)} />
          {thinkingNow !== null ? (
            <div className="flex items-center gap-2 pl-1 text-xs text-muted-foreground">
              <span className="shimmer-text font-medium">생각 중...</span>
              <span className="min-w-0 truncate italic">{thinkingNow}</span>
            </div>
          ) : null}
          {status === "running" && thinkingNow === null ? (
            <div className="flex items-center gap-2 pl-1 text-xs text-muted-foreground">
              <span className="shimmer-text font-medium">작업 중...</span>
            </div>
          ) : null}
          {pendingText !== null ? (
            <div className="flex justify-end">
              <div className="max-w-[85%] animate-pulse rounded-2xl rounded-br-md bg-user-bubble/70 px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words text-user-bubble-foreground">
                {pendingText}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-border bg-background/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
        <div className="mx-auto flex max-w-3xl flex-wrap items-end gap-2">
          {pendingImages.length > 0 ? (
            <div className="flex w-full flex-wrap gap-2 pb-2">
              {pendingImages.map((image, index) => (
                <div key={index} className="relative">
                  <img src={"data:" + image.mime + ";base64," + image.data} alt={image.filename} className="size-14 rounded-md border border-border object-cover" />
                  <button
                    type="button"
                    className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-background text-foreground"
                    onClick={() => setPendingImages((current) => current.filter((_, i) => i !== index))}
                    aria-label={"첨부 이미지 제거 " + (index + 1)}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => { void pickImages(event.target.files); event.target.value = ""; }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            disabled={sending}
            onClick={() => fileInputRef.current?.click()}
            aria-label="이미지 첨부"
          >
            <ImagePlus className="size-4" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="메시지 입력"
            aria-label="메시지"
            className="min-h-11 flex-1 resize-none bg-card/60 sm:max-h-40"
          />
          {busy ? (
            <Button type="button" variant="destructive" size="icon" className="size-11 shrink-0" onClick={() => void requestStop()} aria-label="세션 중지">
              <Square className="size-4 fill-current" />
            </Button>
          ) : (
            <Button type="button" size="icon" className="size-11 shrink-0" disabled={!draft.trim() || sending} onClick={() => void submit()} aria-label="전송">
              <SendHorizonal className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
