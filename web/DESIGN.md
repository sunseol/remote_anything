# Remote Anything 웹 클라이언트 디자인 결정 기록

## 방향

- 데스크톱 에이전트 앱과 어울리도록 zinc 계열 다크 톤, 낮은 채도 표면, 파란 액센트를 쓴다.
- 흔한 원격 제어 앱 구조(코드 페어링 - 세션 목록 - 대화) 3단을 따른다.
- 검증된 shadcn zinc 토큰 체계를 그대로 쓴다.

## 토큰

- 다크 전용 앱이다. shadcn zinc 다크 팔레트를 :root에 직접 적용해 라이트 변형 분기를 없췄다.
- 배경 oklch(0.141 0.005 285.823), 카드 oklch(0.21 0.006 285.885), 보더는 white 10%이다.
- 사용자 버블 --user-bubble oklch(0.55 0.155 257): Aside 액센트 블루 톤으로 어시스턴트 버블(card)과 대비된다.
- radius 0.625rem을 버블/카드/버튼에 공통 적용하고, 사용자 버블만 rounded-br-md로 방향 힌트를 준다.

## 타이포

- 시스템 폰트 스택(-apple-system, Apple SD Gothic Neo, Noto Sans KR 포함)을 쓴다. Geist 자체 호스팅은 한글 폰트 이중 다운로드 문제가 있어 채택하지 않았다(수용된 부채).
- 본문 text-sm/leading-relaxed, 메타 정보 text-xs, 원본 이벤트만 등폭 폰트이다.

## 레이아웃

- 모바일은 1페인(목록 - 대화 스왑), 데스크톱은 320px 리스트 레일 + 대화 2페인이다.
- h-dvh와 safe-area 패딩으로 모바일 브라우저 크롬을 피한다. 대화 열 폭은 max-w-3xl 중앙 정렬이다.

## 모션

- 상태 전환은 transition-colors 기본값만 쓴다. 로딩 표현은 Skeleton과 전송 중 버블 animate-pulse가 전부다.
- Tailwind v4는 prefers-reduced-motion에서 pulse를 포함한 모션을 축소한다.

## 접근성

- 아이콘 버튼 전부 aria-label을 갖는다. 상태 배지는 색과 텍스트를 병기한다.
- 페어링/전송 에러는 role=alert 텍스트로 노출한다. 한글 IME 조합 중 Enter는 isComposing으로 걸러 전송하지 않는다.

## 수용된 부채

- 도구 호출 블록은 raw JSON 축소 표시이며, Aside 네이티브 도구 UI 재현은 별도 과제다.
- suspension 상태는 표시와 중지까지만 지원하고 원격 승인 응답은 미구현이다.
- 시스템 폰트 스택을 쓴다. 토스트 테마는 dark 고정이다.

## 검증 계획

- npm run build(tsc -b + vite build) 통과.
- 127.0.0.1:8811에서 페어링 - 목록 - 대화 실시간 송수신 QA, 375px 모바일 뷰포트 캡처.
