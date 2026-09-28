# Windows 운영 가이드

macOS LaunchAgent 구성의 Windows 대응물이다. 서버 본체(`server/sync-server.mjs`)는 하나이고 Windows에서 같은 API/웹 UI를 제공한다.

## 요구 사항

- Node.js 22 이상 (`node --version`)
- Aside 앱 + CLI 설치. CLI는 `aside --version`이 PATH에서 잡히면 그걸 쓰고, 없으면 `%LOCALAPPDATA%\Aside\CLI\current\aside.exe`를 자동으로 찾는다. 그것도 아니면 `--aside "<경로>"`로 직접 지정.
- Aside 데스크톱 앱이 로그인돼 있고 daemon이 실행 중이어야 한다.

## 빠른 시작 (수동 실행)

```powershell
cd remote-anything
Push-Location web; npm install; npm run build; Pop-Location   # web/ 클라이언트 빌드 (최초 1회, 생략하면 내장 페이지)
node server/sync-server.mjs --host 0.0.0.0 --port 8811
```

터미널에 6자리 페어링 코드가 출력된다. 폰 브라우저에서 `http://<PC의 LAN IP>:8811` 접속 후 코드 입력.

## 상시 실행 (예약 작업 = macOS LaunchAgent 대응)

```powershell
cd remote-anything\windows
powershell -ExecutionPolicy Bypass -File install-task.ps1     # 로그온 시 자동 시작 + watchdog
powershell -ExecutionPolicy Bypass -File status.ps1           # 작업 상태 + healthz + 페어링 코드
powershell -ExecutionPolicy Bypass -File logs.ps1 -Follow     # 로그 tail
powershell -ExecutionPolicy Bypass -File uninstall-task.ps1   # 제거
```

- 작업 이름 `RemoteAnything`, 로그온 트리거, `wscript`로 숨김 실행(콘솔 창 깜빡임 없음).
- `remote-anything-watchdog.ps1`이 node를 무한 재시작한다(LaunchAgent KeepAlive 동등).
- 포트/호스트 변경: `windows\bridge.args` 파일 한 줄 (예: `--host 0.0.0.0 --port 8811`).
- 로그: `%LOCALAPPDATA%\remote-anything\bridge.log`
- 재기동할 때마다 페어링 코드가 새로 만들어지고 로그에 기록된다.

## 같은 Wi-Fi 폰에서 접속 (방화벽)

Windows는 인바운드가 기본 차단이므로 관리자 PowerShell에서 1회만:

```powershell
powershell -ExecutionPolicy Bypass -File windows\firewall.ps1    # TCP 8811, LocalSubnet 한정
```

제거는 `windows\firewall.ps1 -Remove`.

## 외부 네트워크 (Tailscale)

Windows의 Tailscale도 macOS와 동일하게 동작한다:

```powershell
tailscale serve --bg 8811
```

`https://<머신이름>.<tailnet>.ts.net`으로 tailnet 안의 어떤 기기에서든 접속된다. 인증서·암호화는 Tailscale이 처리한다.
## macOS와의 차이

- `sqlite3` CLI가 기본 없는 Windows를 위해 세션 모델 조회는 `node:sqlite`를 먼저 쓰고, 없는 구형 Node에서만 CLI로 폴백한다.
- aside 자식 프로세스는 `windowsHide`로 띄워 백그라운드 실행에서 콘솔 창이 안 뜬다.
- 세션 저장소(`~/.aside/u`), MCP/CLI 경로, 페어링·쿠키·SSE 동작은 macOS와 동일하다.
