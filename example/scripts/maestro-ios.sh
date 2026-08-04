#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_ID="com.example.expomapsnavigation"
METRO_PORT="${METRO_PORT:-8084}"

export PATH="$PATH:$HOME/.maestro/bin"

# Point the simulator debug build at this project's Metro (avoids RN version mismatch
# when another Metro is already bound to 8081).
xcrun simctl spawn booted defaults write "$APP_ID" jsLocation -string "localhost:${METRO_PORT}" || true

xcrun simctl terminate booted "$APP_ID" 2>/dev/null || true
sleep 1
xcrun simctl launch booted "$APP_ID" || true
sleep 4

cd "$ROOT"
maestro test maestro/*.yaml "$@"
