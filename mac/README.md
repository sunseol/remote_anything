# macOS 운영 가이드

서버 본체(server/sync-server.mjs)는 플랫폼 공용이고, 이 디렉터리는 macOS 상시 실행(LaunchAgent) 킷만 담는다.

## 요구 사항

- Node.js 22 이상 (node --version)
- Aside 앱 + CLI 설치, 데스크톱 앱 로그인 및 daemon 실행 중

## 빠른 시작 (수동 실행)

    cd <저장소 경로>
    node server/sync-server.mjs --host 0.0.0.0 --port 8811

터미널에 6자리 페어링 코드가 출력된다. 폰 브라우저에서 http://<맥의 LAN IP>:8811 접속 후 코드 입력.

## 상시 실행 (LaunchAgent)

    sh mac/install.sh      # 설치 + 즉시 기동 (KeepAlive)
    sh mac/uninstall.sh    # 제거

- label local.remote-anything.bridge, 죽으면 launchd가 자동 재시작한다.
- 포트/호스트 변경: mac/local.remote-anything.bridge.plist.template 의 ProgramArguments를 고치고 재설치.
- 로그: ~/Library/Logs/remote-anything.log
- 재기동할 때마다 페어링 코드가 새로 만들어지고 로그에 기록된다.

    tail -20 ~/Library/Logs/remote-anything.log | grep "Pairing code"      # 페어링 코드
    launchctl kickstart -k gui/$(id -u)/local.remote-anything.bridge      # 재시작
    launchctl print gui/$(id -u)/local.remote-anything.bridge             # 상태

## 외부 네트워크 (Tailscale)

같은 Wi-Fi가 아니면 Tailscale serve로 8811을 tailnet HTTPS 주소에 프록시한다.

    tailscale serve --bg --https=443 http://127.0.0.1:8811

폰에서 같은 계정의 Tailscale VPN을 켜고 https://<맥이름>.<tailnet>.ts.net 을 열면 어느 네트워크에서든 같은 페어링 코드로 접속한다. 인증서와 암호화는 Tailscale이 처리하고 트래픽은 tailnet 밖으로 나가지 않는다.
