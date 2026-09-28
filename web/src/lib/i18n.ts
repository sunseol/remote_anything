// 의존성 없는 최소 i18n. 언어는 저장된 선택 → 브라우저 언어 순으로 정하고, 바꾸면 페이지를 새로 불러온다.
// 새로 불러오므로 모듈 수준 상수 표(상태 라벨 등)에서도 t()를 그대로 쓸 수 있다.

const en = {
  "app.starting": "Starting Remote Anything...",
  "app.selectSession": "Select a session",
  "app.selectSessionHint": "Open an Aside session from the list to see the live conversation here.",
  "app.subtitle": "Your live sessions",
  "app.newSession": "New session",
  "app.refreshList": "Refresh session list",
  "app.loadError": "Couldn't load sessions. Retrying automatically.",
  "lang.switch": "Switch language",

  "pair.title": "Pair this device",
  "pair.success": "Paired",
  "pair.invalid": "The code doesn't match. Check the code shown on your computer.",
  "pair.tooMany": "Too many attempts. Try again in a minute.",
  "pair.locked": "Pairing is locked after too many failed attempts. Restart the server on your computer.",
  "pair.failed": "Couldn't connect. Check your network.",
  "pair.description": "Enter the 6-digit pairing code shown in the server's terminal.",
  "pair.codeLabel": "Pairing code",
  "pair.connecting": "Connecting...",
  "pair.connect": "Connect",

  "list.empty": "No sessions to show.",
  "list.emptyHint": "Sessions you start in Aside will appear here.",

  "status.idle": "Idle",
  "status.running": "Running",
  "status.interrupted": "Interrupted",
  "status.error": "Error",
  "status.suspended": "Needs approval",
  "status.done": "Done",

  "conn.connecting": "Connecting...",
  "conn.live": "Live",
  "conn.disconnected": "Disconnected - retrying",

  "chat.pairingExpired": "Pairing expired. Reload the page.",
  "chat.unknownError": "Something went wrong.",
  "chat.sendError": "Send failed: {message}",
  "chat.readFailed": "Couldn't read the file",
  "chat.imagesOnly": "Please choose image files.",
  "chat.answered": "Answer sent. Resuming the session.",
  "chat.queued": "The session is running. Your message was queued.",
  "chat.imageNote": "Attached image: {path}",
  "chat.imageDefaultPrompt": "Please look at the attached image and describe it.",
  "chat.stopRequested": "Stop requested.",
  "chat.back": "Back to sessions",
  "chat.reload": "Reload conversation",
  "chat.changeModel": "Change model",
  "chat.model": "Model",
  "chat.subagents": "Show subagents",
  "chat.runningBanner": "Running - new messages will be queued",
  "chat.suspendedBanner": "Waiting for approval - approve it in the Aside app",
  "chat.loading": "Loading...",
  "chat.loadOlder": "Load earlier messages",
  "chat.empty": "No messages yet. Send one to get started.",
  "chat.thinking": "Thinking...",
  "chat.working": "Working...",
  "chat.removeImage": "Remove attached image {n}",
  "chat.attachImage": "Attach image",
  "chat.placeholder": "Message",
  "chat.messageLabel": "Message",
  "chat.stop": "Stop session",
  "chat.send": "Send",

  "transcript.turnStart": "Turn started",
  "transcript.turnEnd": "Turn finished",
  "transcript.turnOther": "Turn {event}",
  "transcript.thought": "Thought: {label}",
  "transcript.thinkingFallback": "Thinking",
  "transcript.collapseImage": "Shrink image",
  "transcript.expandImage": "Enlarge image",
  "transcript.attachedImage": "Attached image",
  "transcript.tool": "Tool",
  "transcript.toolResult": "Tool result",
  "transcript.noResult": "No output",
  "transcript.sendingAnswer": "Sending answer: {answer}",
  "transcript.question": "Question",
  "transcript.questionAnswered": "Question (answered)",
  "transcript.attachmentOnly": "(attachment)",
  "transcript.emptyReply": "(empty reply)",
  "transcript.subagentResult": "Subagent result",
  "transcript.rawEvent": "Raw event ({role})",

  "sheet.close": "Close",
  "newSession.title": "New session",
  "newSession.project": "Project",
  "newSession.noProject": "No project",
  "newSession.newProject": "New project",
  "newSession.projectName": "New project name",
  "newSession.create": "Create",
  "newSession.firstMessage": "First message",
  "newSession.placeholder": "Tell the agent what to do. Sending starts a new session.",
  "newSession.start": "Start session",
  "newSession.projectFailed": "Couldn't create the project",
  "newSession.sessionFailed": "Couldn't start the session",

  "model.title": "Change model",
  "model.loading": "Loading...",
  "model.loadFailed": "Couldn't load models",
  "model.changeFailed": "Couldn't change the model",
  "model.thinkingDepth": "Thinking depth",
  "model.changeTo": "Switch to {model}",
  "model.choose": "Choose a model",

  "subagents.title": "Subagents",
  "subagents.backToList": "Back to list",
  "subagents.loading": "Loading...",
  "subagents.loadFailed": "Couldn't load subagents",
  "subagents.empty": "This session has no subagent tasks.",
  "subagents.status": "Status",
  "subagents.taskId": "Task ID",
  "subagents.profile": "Profile",
  "subagents.instructions": "Instructions",
  "subagents.result": "Result",
  "subagents.noResult": "No result yet.",

  "time.justNow": "just now",
  "time.minutes": "{n}m ago",
  "time.hours": "{n}h ago",
  "time.days": "{n}d ago",

  "api.offline": "Can't reach the network",
} as const;

export type MessageKey = keyof typeof en;

const ko: Record<MessageKey, string> = {
  "app.starting": "Remote Anything 시작 중...",
  "app.selectSession": "세션을 선택하세요",
  "app.selectSessionHint": "목록에서 Aside 세션을 열면 실시간 대화가 여기에 표시됩니다.",
  "app.subtitle": "내 라이브 세션",
  "app.newSession": "새 세션",
  "app.refreshList": "세션 목록 새로고침",
  "app.loadError": "세션 목록을 가져오지 못했습니다. 잠시 후 자동으로 재시도합니다.",
  "lang.switch": "언어 변경",

  "pair.title": "기기 페어링",
  "pair.success": "페어링 완료",
  "pair.invalid": "코드가 일치하지 않습니다. 컴퓨터 화면의 코드를 확인하세요.",
  "pair.tooMany": "시도 횟수가 너무 많습니다. 1분 후에 다시 시도하세요.",
  "pair.locked": "실패가 너무 많아 페어링이 잠겼습니다. 컴퓨터에서 서버를 재시작하세요.",
  "pair.failed": "연결에 실패했습니다. 네트워크 상태를 확인하세요.",
  "pair.description": "서버 터미널에 표시된 6자리 페어링 코드를 입력하세요.",
  "pair.codeLabel": "페어링 코드",
  "pair.connecting": "연결 중...",
  "pair.connect": "연결",

  "list.empty": "표시할 세션이 없습니다.",
  "list.emptyHint": "Aside에서 새 세션을 시작하면 여기에 나타납니다.",

  "status.idle": "대기",
  "status.running": "실행 중",
  "status.interrupted": "중단됨",
  "status.error": "오류",
  "status.suspended": "승인 대기",
  "status.done": "완료",

  "conn.connecting": "연결 중...",
  "conn.live": "실시간 연결",
  "conn.disconnected": "연결 끊김 - 재시도 중",

  "chat.pairingExpired": "페어링이 만료되었습니다. 페이지를 새로고침하세요.",
  "chat.unknownError": "알 수 없는 오류가 발생했습니다.",
  "chat.sendError": "전송 오류: {message}",
  "chat.readFailed": "읽기 실패",
  "chat.imagesOnly": "이미지 파일을 선택해주세요.",
  "chat.answered": "답변을 전달했습니다. 세션을 재개합니다.",
  "chat.queued": "세션이 실행 중입니다. 메시지를 대기열에 추가했습니다.",
  "chat.imageNote": "이미지 첨부: {path}",
  "chat.imageDefaultPrompt": "첨부한 이미지를 확인하고 내용을 설명해 주세요.",
  "chat.stopRequested": "중지 요청을 보냈습니다.",
  "chat.back": "세션 목록으로 돌아가기",
  "chat.reload": "대화 새로고침",
  "chat.changeModel": "모델 변경",
  "chat.model": "모델",
  "chat.subagents": "서브에이전트 보기",
  "chat.runningBanner": "실행 중 - 새 메시지는 대기열에 추가됩니다",
  "chat.suspendedBanner": "승인 대기 - Aside 앱에서 승인이 필요합니다",
  "chat.loading": "불러오는 중...",
  "chat.loadOlder": "이전 대화 불러오기",
  "chat.empty": "아직 대화가 없습니다. 메시지를 보내보세요.",
  "chat.thinking": "생각 중...",
  "chat.working": "작업 중...",
  "chat.removeImage": "첨부 이미지 제거 {n}",
  "chat.attachImage": "이미지 첨부",
  "chat.placeholder": "메시지 입력",
  "chat.messageLabel": "메시지",
  "chat.stop": "세션 중지",
  "chat.send": "전송",

  "transcript.turnStart": "턴 시작",
  "transcript.turnEnd": "턴 완료",
  "transcript.turnOther": "턴 {event}",
  "transcript.thought": "생각: {label}",
  "transcript.thinkingFallback": "사고 과정",
  "transcript.collapseImage": "이미지 축소",
  "transcript.expandImage": "이미지 확대",
  "transcript.attachedImage": "첨부 이미지",
  "transcript.tool": "도구",
  "transcript.toolResult": "도구 결과",
  "transcript.noResult": "결과 없음",
  "transcript.sendingAnswer": "답변 전송 중: {answer}",
  "transcript.question": "질문",
  "transcript.questionAnswered": "질문 (응답완료)",
  "transcript.attachmentOnly": "(첨부 메시지)",
  "transcript.emptyReply": "(빈 응답)",
  "transcript.subagentResult": "서브에이전트 결과",
  "transcript.rawEvent": "원본 이벤트 ({role})",

  "sheet.close": "닫기",
  "newSession.title": "새 세션",
  "newSession.project": "프로젝트",
  "newSession.noProject": "프로젝트 없음",
  "newSession.newProject": "새 프로젝트",
  "newSession.projectName": "새 프로젝트 이름",
  "newSession.create": "만들기",
  "newSession.firstMessage": "첫 메시지",
  "newSession.placeholder": "무엇을 시킬지 입력하세요. 전송하면 새 세션이 시작됩니다.",
  "newSession.start": "세션 시작",
  "newSession.projectFailed": "프로젝트 생성 실패",
  "newSession.sessionFailed": "세션 생성 실패",

  "model.title": "모델 변경",
  "model.loading": "불러오는 중...",
  "model.loadFailed": "불러오기 실패",
  "model.changeFailed": "변경 실패",
  "model.thinkingDepth": "사고 깊이",
  "model.changeTo": "{model} 로 변경",
  "model.choose": "모델을 선택하세요",

  "subagents.title": "서브에이전트",
  "subagents.backToList": "목록으로 돌아가기",
  "subagents.loading": "불러오는 중...",
  "subagents.loadFailed": "불러오기 실패",
  "subagents.empty": "이 세션에 서브에이전트 작업이 없습니다.",
  "subagents.status": "상태",
  "subagents.taskId": "작업 ID",
  "subagents.profile": "프로필",
  "subagents.instructions": "지시 내용",
  "subagents.result": "결과",
  "subagents.noResult": "아직 결과가 없습니다.",

  "time.justNow": "방금 전",
  "time.minutes": "{n}분 전",
  "time.hours": "{n}시간 전",
  "time.days": "{n}일 전",

  "api.offline": "네트워크에 연결할 수 없습니다",
};

export type Lang = "en" | "ko";
export const LANGS: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "ko", label: "한국어" },
];

const STORAGE_KEY = "remote-anything.lang";
const MESSAGES: Record<Lang, Record<MessageKey, string>> = { en, ko };

function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "ko") return stored;
  } catch {
    void 0;
  }
  const preferred = typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]);
  return preferred.some((tag) => tag?.toLowerCase().startsWith("ko")) ? "ko" : "en";
}

export const lang: Lang = detectLang();
export const locale = lang === "ko" ? "ko-KR" : "en-US";

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const template = MESSAGES[lang][key] ?? en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function setLang(next: Lang) {
  if (next === lang) return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    void 0;
  }
  location.reload();
}
