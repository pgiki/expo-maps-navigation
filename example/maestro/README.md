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

## Simulate vs live GPS

| Mode (home button) | `shouldSimulateRoute` | How position moves |
| --- | --- | --- |
| **Start Navigation** / **Start Fast Simulation** | `true` | Library walks the polyline (no device GPS) |
| **Start Live GPS Navigation** | `false` | Real GPS / Maestro `setLocation` / `travel` |

Maestro `setLocation` and `travel` only affect navigation when the session is **live** (`shouldSimulateRoute={false}`). Simulate flows must keep using the simulate buttons; live flows must tap **Start Live GPS Navigation**.

- **iOS Simulator:** Maestro spoofs Core Location via `setLocation` / `travel`.
- **Android:** `setLocation` requires **API 31+**.

## Off-route timing (live flows)

Must match production (`src/osrm/offRoute.ts`):

| Constant | Value | Meaning |
| --- | --- | --- |
| `REROUTE_STARTUP_GRACE_MS` | **15s** | No auto-reroute after session start |
| `OFF_ROUTE_CONSECUTIVE` | **5** | Consecutive off-route samples |
| `OFF_ROUTE_MIN_DURATION_MS` | **3s** | Continuous off-route before confirm |

Live spike / reroute flows burn past the 15s grace with on-corridor `travel` (~0.04 km/s over Shop→Cafe, ~16s wall-clock — grace cannot be shortened). Other live flows use instant `setLocation` jumps or fast `travel` (~0.2 km/s) so the suite stays short.

- **Spike:** brief far jump → back on corridor → assert `rerouting-status` stays **not** visible
- **Reroute:** sustained off (≥5 samples / ≥3s) → assert `rerouting-status` appears

## Flows

### Simulate (polyline)

| Flow | Covers |
| --- | --- |
| `navigation-start-cancel.yaml` | Start sim → cancel tears down session → home (`navigation-view` gone) |
| `navigation-arrive.yaml` | Fast simulation → arrive overlay → Done → home |
| `navigation-course-up.yaml` | Course-up bearing (requires expo-maps patch + `buildFromSource`) — screenshots in `maestro/screenshots/` |
| `navigation-free-mode.yaml` | Drag `map-follow-surface` → free mode (`recenter-button`) → recenter resumes follow |
| `navigation-error.yaml` | Bad OSRM URL → `nav-error` / `onError` |

### Live GPS (`setLocation` / `travel`)

| Flow | Covers |
| --- | --- |
| `navigation-live-progress.yaml` | Live start → corridor fixes → chrome (`maneuver-banner`, `trip-progress`, `trip-eta`) → cancel → home |
| `navigation-live-mute.yaml` | On-route fixes → mute → more locations (chrome stays) → unmute → cancel |
| `navigation-live-free-mode.yaml` | On-route fix → swipe `map-follow-surface` → `recenter-button` → follow resumes |
| `navigation-live-gps-spike.yaml` | Past 15s grace → brief off-route spike → back on corridor → **no** `rerouting-status` |
| `navigation-live-reroute.yaml` | Past 15s grace → sustained off → `rerouting-status` → recover toward corridor |
| `navigation-live-arrive.yaml` | Step `setLocation` to destination → `end-of-route` → Done → home |
| `navigation-live-cancel-midtrip.yaml` | Mid progress → cancel → home; no `navigation-view` |

Permission-deny retry is covered in-unit via the `permission-retry` control; forcing the system dialog in Maestro is host/OS-specific and not automated here.

## Notes

- Do **not** use `clearState: true` in flows — it wipes `jsLocation` and the app may reconnect to the wrong Metro (RN version mismatch).
- Prefer `id:` selectors for chrome controls (mute/cancel). Do **not** rely on visible “Cancel” text — the bottom strip uses icon buttons.
- Corridor coordinates match the example Chandigarh route (Home → Shop → Cafe → Pickup).
