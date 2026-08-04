# Maestro E2E flows for the example app

## Prerequisites

1. Install Maestro: https://maestro.mobile.dev
2. Build & install the example on a simulator:
   ```sh
   cd example
   npx expo prebuild --platform ios
   npx expo start --port 8084   # Terminal A
   npx expo run:ios --device "iPhone 17" --port 8084
   ```
3. If another Metro owns port 8081, point the app at yours (the helper script does this):
   ```sh
   xcrun simctl spawn booted defaults write com.example.expomapsnavigation jsLocation -string "localhost:8084"
   ```

## Run

```sh
cd example
./scripts/maestro-ios.sh
# or
npm run maestro:ios
```

App ID: `com.example.expomapsnavigation`

## Flows

| Flow | Covers |
| --- | --- |
| `navigation-start-cancel.yaml` | Start sim → cancel tears down session → home (`navigation-view` gone) |
| `navigation-arrive.yaml` | Fast simulation → arrive overlay → Done → home |
| `navigation-course-up.yaml` | Course-up bearing (requires expo-maps patch + `buildFromSource`) — screenshots in `maestro/screenshots/` |
| `navigation-free-mode.yaml` | Drag `map-follow-surface` → free mode (`recenter-button`) → recenter resumes follow |
| `navigation-error.yaml` | Bad OSRM URL → `nav-error` / `onError` |

Permission-deny retry is covered in-unit via the `permission-retry` control; forcing the system dialog in Maestro is host/OS-specific and not automated here.

## Notes

- Do **not** use `clearState: true` in flows — it wipes `jsLocation` and the app may reconnect to the wrong Metro (RN version mismatch).
- Prefer `id:` selectors for chrome controls (mute/cancel). Do **not** rely on visible “Cancel” text — the bottom strip uses icon buttons.
