# Upstream expo-maps bearing support

## Goal

Remove the host `expo-maps+57.0.1` patch once Expo applies camera `bearing` in `setCameraPosition` on both platforms.

## Current behavior (unpatched 57)

| Platform | `setCameraPosition` path | Bearing |
| --- | --- | --- |
| iOS | `MKCoordinateRegion` | Ignored |
| Android | `CameraUpdateFactory.newLatLngZoom` | Ignored |

The example / published patch wires bearing into the native camera update (iOS region+heading / Android `newCameraPosition` with bearing).

## Tracking

1. Open or watch an Expo issue / PR for bearing on `AppleMaps.View` / `GoogleMaps.View` `setCameraPosition`.
2. When a release includes the fix, bump the `expo-maps` peer range and delete `patches/expo-maps+57.0.1.patch`.
3. Keep documenting **degraded north-up** for hosts that cannot patch.

## Verification

After dropping the patch, run the example Maestro flow `navigation-course-up.yaml` — camera bearing should still change while following the route.
