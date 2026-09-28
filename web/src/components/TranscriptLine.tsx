import { memo, useState } from "react";
import { Bot, CornerDownLeft, ChevronRight, HelpCircle, Wrench } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Markdown } from "@/components/Markdown";
import { envelopeText, thinkingLabel, toolCallsOf, toolResultText } from "@/lib/types";
import { toApiFile } from "@/components/Markdown";
import type { ContentBlock, Envelope } from "@/lib/types";

const TURN_LABELS: Record<string, string> = {
  start: "턴 시작",
  started: "턴 시작",
  end: "턴 완료",
  finish: "턴 완료",
  finished: "턴 완료",
  complete: "턴 완료",
};

function ThinkingBlock({ texts }: { texts: string[] }) {
  const label = thinkingLabel(texts[texts.length - 1] ?? "");
  return (
    <Collapsible className="mb-2">
      <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
        <span className="italic">생각: {label}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1.5 flex flex-col gap-1.5 border-l-2 border-border pl-2.5">
          {texts.map((text, index) => (
            <p key={index} className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">{text}</p>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ImageBlock({ block, sessionId }: { block: ContentBlock; sessionId?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  let src = "";
  if (typeof block.data === "string" && block.data) {
    src = "data:" + (block.mimeType ?? "image/png") + ";base64," + block.data;
  } else {
    const ref = [block.src, block.url, block.path, block.fileUrl].find((value) => typeof value === "string" && value.trim().length > 0);
    if (ref) src = toApiFile(ref, sessionId);
  }
  if (!src) return null;
  return (
    <button type="button" className="my-1.5 block max-w-full cursor-zoom-in" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "이미지 축소" : "이미지 확대"}>
      <img src={src} alt="첨부 이미지" loading="lazy" className={expanded ? "max-h-[80vh] w-auto max-w-full rounded-lg border border-border" : "max-h-72 w-auto max-w-full rounded-lg border border-border"} />
    </button>
  );
}

function summarizeCallArgs(block: ContentBlock): string {
  if (typeof block.title === "string" && block.title.trim()) return block.title;
  const args = block.arguments ?? {};
  for (const value of Object.values(args)) {
    if (typeof value === "string" && value.trim()) return value.trim().split("\n")[0].slice(0, 80);
  }
  return "";
}

function ToolCallCard({ block }: { block: ContentBlock }) {
  const argsText = JSON.stringify(block.arguments ?? {}, null, 1);
  const summary = summarizeCallArgs(block);
  return (
    <Collapsible className="my-1.5">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-lg border border-border/70 bg-background/40 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent">
        <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-medium">{block.name ?? "도구"}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{summary}</span>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 max-h-56 overflow-auto rounded-lg bg-background/70 p-2 text-[11px] leading-snug whitespace-pre-wrap break-all text-muted-foreground">{argsText}</pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface QuestionOption { label?: string; description?: string }
interface QuestionItem { question?: string; header?: string; options?: QuestionOption[] }

function QuestionCard({ block, answerable, onAnswer }: { block: ContentBlock; answerable: boolean; onAnswer: (text: string) => void }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const locked = !answerable || chosen !== null;
  const questions: QuestionItem[] = Array.isArray(block.arguments?.questions) ? (block.arguments?.questions as QuestionItem[]) : [];
  return (
    <Collapsible className="my-1.5">
      <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-sky-400">
          <HelpCircle className="size-3.5" />
          <span>{chosen ? "답변 전송 중: " + chosen : answerable ? "질문" : "질문 (응답완료)"}</span>
        </div>
        {questions.map((item, qIndex) => (
          <div key={qIndex} className="mt-2">
            {item.header ? <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{item.header}</p> : null}
            {item.question ? <p className="mt-0.5 text-sm font-medium leading-snug">{item.question}</p> : null}
            <div className="mt-2 flex flex-col gap-1.5">
              {(item.options ?? []).map((option, oIndex) => (
                <button
                  key={oIndex}
                  type="button"
                  disabled={locked}
                  className={locked
                    ? "rounded-lg border border-border/40 bg-background/30 px-3 py-2 text-left opacity-50"
                    : "rounded-lg border border-border bg-background/60 px-3 py-2 text-left transition-colors hover:border-sky-500/50 hover:bg-accent"}
                  onClick={() => { if (locked) return; const label = String(option.label ?? ""); setChosen(label); onAnswer(label); }}
                >
                  <span className="block text-sm font-medium">{option.label}</span>
                  {option.description ? <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{option.description}</span> : null}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <CollapsibleContent>
        <pre className="mt-1 max-h-56 overflow-auto rounded-lg bg-background/70 p-2 text-[11px] leading-snug whitespace-pre-wrap break-all text-muted-foreground">{JSON.stringify(block.arguments ?? {}, null, 1)}</pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolResultCard({ envelope }: { envelope: Envelope }) {
  const text = toolResultText(envelope);
  const firstLine = text.split("\n").find((line) => line.trim().length > 0) ?? "결과 없음";
  return (
    <Collapsible className="my-1.5 ml-5">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent">
        <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-medium">{envelope.toolName ?? "도구 결과"}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{firstLine.slice(0, 90)}</span>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-background/70 p-2 text-[11px] leading-snug whitespace-pre-wrap break-all text-muted-foreground">{text.slice(0, 6000)}</pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

// memo: draft 한 글자 입력마다 대화 전체(마크다운 전부)가 다시 그려져 모바일에서
// 화면 깜박임이 생겼다. envelope이 바뀐 줄만 다시 그리도록 memo로 감싼다.
export const TranscriptLine = memo(function TranscriptLine({ envelope, answerableQuestionId, onAnswer, sessionId }: { envelope: Envelope; answerableQuestionId?: string | null; onAnswer?: (text: string) => void; sessionId?: string | null }) {
  const role = String(envelope.role ?? "event");

  if (role === "user") {
    const text = envelopeText(envelope) || "(첨부 메시지)";
    return (
      <div className="cv-auto flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-user-bubble px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words text-user-bubble-foreground">
          {text}
        </div>
      </div>
    );
  }

  if (role === "toolResult") {
    return <div className="cv-auto"><ToolResultCard envelope={envelope} /></div>;
  }

  if (role === "assistant") {
    const blocks = Array.isArray(envelope.content) ? envelope.content : [];
    const thinkings = blocks.filter((block) => block.type === "thinking" && typeof block.thinking === "string");
    const texts = blocks.filter((block) => block.type === "text" && typeof block.text === "string" && block.text.trim().length > 0);
    const calls = toolCallsOf(envelope);
    const images = blocks.filter((block) => block.type === "image");
    const hasAny = thinkings.length > 0 || texts.length > 0 || calls.length > 0 || images.length > 0;
    return (
      <div className="cv-auto flex justify-start">
        <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-2 text-sm leading-relaxed">
          {thinkings.length > 0 ? <ThinkingBlock texts={thinkings.map((block) => block.thinking as string)} /> : null}
          {texts.map((block, index) => (
            <Markdown key={index} text={block.text ?? ""} sessionId={sessionId} />
          ))}
          {calls.map((block, index) =>
            block.name === "ask_user_question" ? (
              <QuestionCard
                key={typeof block.id === "string" ? block.id : "q-" + index}
                block={block}
                answerable={answerableQuestionId != null && block.id === answerableQuestionId}
                onAnswer={(text) => onAnswer?.(text)}
              />
            ) : (
              <ToolCallCard key={typeof block.id === "string" ? block.id : index} block={block} />
            )
          )}
          {images.map((block, index) => (
            <ImageBlock key={typeof block.id === "string" ? block.id : "img-" + index} block={block} sessionId={sessionId} />
          ))}
          {!hasAny && typeof envelope.errorMessage === "string" && envelope.errorMessage ? (
            <p className="break-words text-xs leading-relaxed text-destructive">{envelope.errorMessage}</p>
          ) : null}
          {!hasAny && !envelope.errorMessage ? (
            <span className="text-xs text-muted-foreground">(빈 응답)</span>
          ) : null}
        </div>
      </div>
    );
  }

  if (role === "turn-lifecycle") {
    const label = TURN_LABELS[String(envelope.event ?? "")] ?? "턴 " + String(envelope.event ?? "");
    return (
      <div className="cv-auto my-1 flex items-center gap-3" role="separator">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[11px] tracking-wide text-muted-foreground">{label}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }

function SubagentDoneCard({ taskId, meta, result, sessionId }: { taskId: string; meta: string; result: string; sessionId?: string | null }) {
  return (
    <Collapsible className="cv-auto mx-auto w-full max-w-[92%]">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent">
        <Bot className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-medium">서브에이저뇈 결과</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{meta || taskId}</span>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 max-h-80 overflow-auto rounded-lg border border-border/50 bg-card p-2.5 text-xs leading-relaxed">
          <Markdown text={result} sessionId={sessionId} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
  }

  if (role === "system-message") {
    const subMatch = typeof envelope.content === "string"
      ? envelope.content.match(/^Subagent\s+(\S+)\s+is done\s*\(([^)]*)\)\s*<result>\n?([\s\S]*?)(?:\n?<\/result>\s*|$)/)
      : null;
    if (subMatch) {
      return <SubagentDoneCard taskId={subMatch[1]} meta={subMatch[2]} result={subMatch[3]} sessionId={sessionId} />;
    }
    const body = typeof envelope.content === "string"
      ? envelope.content
      : JSON.stringify(envelope.content ?? envelope).slice(0, 400);
    return (
      <div className="cv-auto mx-auto max-w-[90%] rounded-lg border border-border/60 bg-muted/40 px-3 py-1.5 text-center text-xs leading-relaxed text-muted-foreground">
        {envelope.kind ? <span className="font-medium">[{envelope.kind}] </span> : null}
        <span className="break-words">{body}</span>
      </div>
    );
  }

  const raw = role === "unreadable" && envelope.raw ? envelope.raw : JSON.stringify(envelope);
  return (
    <Collapsible className="cv-auto mx-auto w-full max-w-[92%]">
      <CollapsibleTrigger className="text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline">
        원본 이벤트 ({role})
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 max-h-56 overflow-auto rounded-lg bg-background/70 p-2 text-[11px] leading-snug whitespace-pre-wrap break-all text-muted-foreground">
          {raw}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
});
