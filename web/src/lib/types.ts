export interface ProjectInfo {
  id: string;
  name: string;
}

export interface SessionInfo {
  id: string;
  title: string;
  status: string;
  suspension?: string | null;
  updatedAt?: string | number | null;
  parentId?: string | null;
  projectId?: string | null;
}

export interface SessionStatusInfo {
  id: string;
  status: string;
  suspension?: string | null;
  updatedAt?: string | number | null;
}

export interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  title?: string;
  arguments?: Record<string, unknown>;
  data?: string;
  mimeType?: string;
  src?: string;
  url?: string;
  path?: string;
  fileUrl?: string;
}

export interface Envelope {
  role?: string;
  content?: string | ContentBlock[];
  kind?: string;
  event?: string;
  turnId?: string;
  timestamp?: string | number;
  raw?: string;
  toolCallId?: string;
  toolName?: string;
  stopReason?: string;
  errorMessage?: string;
}

export interface SubagentInfo {
  taskId: string | null;
  description: string;
  prompt: string;
  profile: string;
  modelCategory: string;
  runInBackground: boolean;
  status: string;
  progress: string | null;
  result: string | null;
}

export interface SnapshotMeta {
  headBytes: number;
  hasMore: boolean;
}

export interface HistoryPage {
  lines: Envelope[];
  headBytes: number;
  hasMore: boolean;
}

export function envelopeText(envelope: Envelope): string {
  if (typeof envelope.content === "string") return envelope.content;
  if (Array.isArray(envelope.content)) {
    return envelope.content
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("\n");
  }
  return "";
}

export function envelopeThinking(envelope: Envelope): string[] {
  if (!Array.isArray(envelope.content)) return [];
  return envelope.content
    .filter((block) => block.type === "thinking" && typeof block.thinking === "string")
    .map((block) => block.thinking as string);
}

export function toolCallsOf(envelope: Envelope): ContentBlock[] {
  if (!Array.isArray(envelope.content)) return [];
  return envelope.content.filter((block) => block.type === "toolCall");
}

export function toolResultText(envelope: Envelope): string {
  if (!Array.isArray(envelope.content)) return typeof envelope.content === "string" ? envelope.content : "";
  return envelope.content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n");
}

export function thinkingLabel(text: string): string {
  const match = text.match(/^\s*\*\*([^*]+)\*\*/);
  if (match) return match[1].trim();
  const firstLine = text.split("\n").find((line) => line.trim().length > 0) ?? "";
  return firstLine.trim().slice(0, 60) || "사고 과정";
}
