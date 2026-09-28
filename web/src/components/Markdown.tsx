import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ComponentPropsWithoutRef } from "react";

// 로컬 세션/프로젝트 워크스페이스의 파일 경로(file://, 절대/상대경로)를 인증된 /api/file URL로 바꾼다.
// http(s), data:, #anchor, mailto:는 그대로 둔다. 상대경로는 세션 컨텍스트가 있어야 서버가 해석한다.
export function toApiFile(href: string, sessionId?: string | null): string {
  let candidate = href.trim();
  if (!candidate || candidate.startsWith("#") || candidate.startsWith("data:") || candidate.startsWith("mailto:")) return candidate;
  if (/^https?:\/\//i.test(candidate) || candidate.startsWith("/api/")) return candidate;
  if (candidate.startsWith("file://")) {
    try { candidate = decodeURIComponent(new URL(candidate).pathname); } catch { /* keep raw */ }
  }
  // Windows file:// pathname: /C:/foo -> C:/foo
  if (/^\/[A-Za-z]:/.test(candidate)) candidate = candidate.slice(1);
  candidate = candidate.replace(/\\/g, "/");
  const query = sessionId
    ? "session=" + encodeURIComponent(sessionId) + "&path=" + encodeURIComponent(candidate)
    : "path=" + encodeURIComponent(candidate);
  return "/api/file?" + query;
}

type MarkdownElementProps = ComponentPropsWithoutRef<"img"> & { sessionId?: string | null };

// react-markdown의 기본 URL 필터는 file: 프로토콜을 제거한다. file:// 링크는
// 아래 toApiFile에서 /api/file로 재작성하므로 새니타이저에서는 통과시킨다.
function allowFileUrl(url: string): string {
  if (/^file:\/\//i.test(url)) return url;
  return defaultUrlTransform(url);
}

function Img({ src, alt, title, sessionId }: MarkdownElementProps) {
  const resolved = src ? toApiFile(src, sessionId) : "";
  return <img src={resolved} alt={alt ?? ""} title={title} loading="lazy" className="my-2 max-h-96 w-auto max-w-full rounded-lg border border-border" />;
}

function A({ href, children, sessionId }: ComponentPropsWithoutRef<"a"> & { sessionId?: string | null }) {
  const resolved = href ? toApiFile(href, sessionId) : undefined;
  const openInNewTab = !!resolved && (/^https?:\/\//i.test(resolved) || resolved.startsWith("/api/"));
  return (
    <a href={resolved} target={openInNewTab ? "_blank" : undefined} rel={openInNewTab ? "noreferrer" : undefined}>
      {children}
    </a>
  );
}

export function Markdown({ text, sessionId }: { text: string; sessionId?: string | null }) {
  return (
    <div className="md-body min-w-0 break-words">
      <ReactMarkdown
        urlTransform={allowFileUrl}
        remarkPlugins={[remarkGfm]}
        components={{
          img: (props) => <Img {...props} sessionId={sessionId} />,
          a: (props) => <A {...props} sessionId={sessionId} />,
        }}
      >{text}</ReactMarkdown>
    </div>
  );
}
