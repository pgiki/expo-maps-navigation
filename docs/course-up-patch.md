# Course-up camera patch (expo-maps 57)

Stock **expo-maps ~57.0.1** ignores `bearing` in `setCameraPosition`:

- **iOS** builds an `MKCoordinateRegion` without heading
- **Android** uses `newLatLngZoom` (no bearing)

Without a patch, navigation stays **north-up**. Course-up (camera follows route heading) requires this host-side patch until upstream Expo lands bearing support.

## Apply in a host app

1. Install [patch-package](https://github.com/ds300/patch-package) and add a postinstall script:

```json
{
  "scripts": {
    "postinstall": "patch-package"
  }
}
```

2. Copy the patch from this repo:

```sh
mkdir -p patches
cp node_modules/expo-maps-navigation/patches/expo-maps+57.0.1.patch patches/
# Or from the git checkout:
# cp patches/expo-maps+57.0.1.patch your-app/patches/
```

The same file lives at:

- [`patches/expo-maps+57.0.1.patch`](../patches/expo-maps+57.0.1.patch) (package / repo root)
- [`example/patches/expo-maps+57.0.1.patch`](../example/patches/expo-maps+57.0.1.patch) (example app)

3. **Force ExpoMaps to build from source** (SDK 57 ships a prebuilt XCFramework that ignores Swift patches). In the host `package.json`:

```json
{
  "expo": {
    "autolinking": {
      "buildFromSource": ["expo-maps"]
    }
  }
}
```

4. Reinstall pods and **rebuild the native app** (`cd ios && pod install`, then `npx expo run:ios` / `run:android`). Metro-only reload is not enough. Confirm the build compiles `MapUtils.swift` / `ExpoMaps` from source (not only “Copy XCFrameworks”).

## Degraded mode

If you skip the patch, `ExpoMapsNavigation` still works: routes, TTS, off-route, and chrome are fine. Only the camera bearing (course-up) is ignored.

## Upstream

See [docs/upstream-bearing.md](./upstream-bearing.md) for dropping this patch once Expo accepts bearing in `setCameraPosition`.
