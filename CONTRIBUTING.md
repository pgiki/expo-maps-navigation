# Contributing

Thanks for contributing to **expo-maps-navigation**.

## Prerequisites

- Node.js **20+** (`engines` in `package.json`)
- Expo SDK **57** development build (not Expo Go — `expo-maps` is native)
- For course-up camera bearing: apply the patch in [`patches/`](patches/) and `expo.autolinking.buildFromSource: ["expo-maps"]` — see [`docs/course-up-patch.md`](docs/course-up-patch.md)

## Develop from source

```sh
git clone https://github.com/fikachu/expo-maps-navigation.git
cd expo-maps-navigation
npm ci
npm run prepare   # bob build → lib/

# Example app (depends on this package via file:..)
cd example
npm ci
# Set Android Google Maps API key in example/app.json (placeholder: YOUR_GOOGLE_MAPS_API_KEY)
npx expo start --port 8084
# In another terminal:
npx expo run:ios --device "iPhone 17" --port 8084   # or your simulator
```

Library source under `src/` is watched by the example Metro config (`watchFolders`).

## Checks before opening a PR

```sh
npm run typecheck
npm test
npx react-doctor@0.9.4 --scope full --blocking warning
npm run build
npm pack --dry-run   # must not include example/
```

## Maestro E2E (example)

See [`example/README.md`](example/README.md) and [`example/maestro/README.md`](example/maestro/README.md).

- Do **not** use Maestro `clearState: true` (wipes `jsLocation` / Metro port).
- Prefer `id:` selectors for chrome (`mute-button`, `cancel-navigation`, `recenter-button`).

## Course-up / native patches

If your change depends on camera `bearing`, document whether hosts still need [`patches/expo-maps+57.0.1.patch`](patches/expo-maps+57.0.1.patch). Do not silently require an unshipped native fork.

## Pull requests

- Keep PRs focused; include a short “why”
- Update [`CHANGELOG.md`](CHANGELOG.md) under Unreleased / the next version when user-facing
- Match existing TypeScript style; avoid new render-phase ref mutations (React Doctor will fail CI)

## Code of conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
