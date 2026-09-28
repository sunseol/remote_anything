// 호환 진입점. 실제 서버 본체는 server/sync-server.mjs 다.
// 기존에 설치된 macOS LaunchAgent와 Windows 예약 작업, 문서의
// "node sync-server.mjs" 호출이 저장소 루트에서 그대로 동작하게 남겨둔다.
import './server/sync-server.mjs';
