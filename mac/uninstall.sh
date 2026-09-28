#!/bin/sh
# LaunchAgent를 내리고 plist를 삭제한다. 저장소 파일은 건드리지 않는다.
set -eu
UID_N="$(id -u)"
launchctl bootout "gui/$UID_N/local.remote-anything.bridge" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/local.remote-anything.bridge.plist"
echo "제거 완료. 로그는 ~/Library/Logs/remote-anything.log 에 남는다."
