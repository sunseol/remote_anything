#!/bin/sh
# Remote Anything 브리지를 macOS LaunchAgent로 상시 실행한다.
# 사용: sh mac/install.sh   (저장소 루트에서, 또는 mac/ 안에서)
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "node를 PATH에서 찾지 못했다. Node.js 22+ 를 설치한 뒤 다시 실행한다." >&2
  exit 1
fi

HOME_DIR="$(cd ~ && pwd)"
PLIST_SRC="$SCRIPT_DIR/local.remote-anything.bridge.plist.template"
PLIST_DST="$HOME_DIR/Library/LaunchAgents/local.remote-anything.bridge.plist"

mkdir -p "$HOME_DIR/Library/Logs" "$HOME_DIR/Library/LaunchAgents"

sed -e "s|__NODE__|$NODE_BIN|g" \
    -e "s|__REPO__|$REPO_DIR|g" \
    -e "s|__HOME__|$HOME_DIR|g" \
    "$PLIST_SRC" > "$PLIST_DST"

UID_N="$(id -u)"
launchctl bootout "gui/$UID_N/local.remote-anything.bridge" 2>/dev/null || true
launchctl bootstrap "gui/$UID_N" "$PLIST_DST"

echo "설치 완료: $PLIST_DST"
echo "저장소: $REPO_DIR"
echo "노드: $NODE_BIN"
echo "로그: ~/Library/Logs/remote-anything.log"
echo "페어링 코드 확인: grep 'Pairing code' ~/Library/Logs/remote-anything.log | tail -1"
