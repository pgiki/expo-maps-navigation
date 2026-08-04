# Example app

Demo host for **expo-maps-navigation** (local `file:..` dependency).

## Prerequisites

- Node 20+
- Expo SDK 57 **development build** (not Expo Go)
- iOS Simulator or Android emulator / device

## Google Maps (Android)

Set your key in `app.json` / `app.config` under the `expo-maps` plugin. Use the placeholder `YOUR_GOOGLE_MAPS_API_KEY` in committed configs — never commit a real key.

## Run

```sh
# From repo root
npm ci && npm run prepare

cd example
npm ci

# Terminal A — Metro (8084 avoids clashes with other Expo apps)
npx expo start --port 8084

# Terminal B — native
npx expo run:ios --device "iPhone 17" --port 8084
# or: npx expo run:android --port 8084
```

Course-up camera: the example already applies `patches/` and `buildFromSource: ["expo-maps"]`. See [docs/course-up-patch.md](../docs/course-up-patch.md).

## Maestro

```sh
cd example
npm run maestro:ios
```

Notes:

- Do **not** use Maestro `clearState: true` (clears `jsLocation` / Metro port wiring).
- Prefer `id:` selectors (`mute-button`, `menu-button`, `cancel-navigation`, `recenter-button`).
- Flows live in [`maestro/`](maestro/). See [`maestro/README.md`](maestro/README.md).
