# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-04

Initial public release.

### Added

- `ExpoMapsNavigation` — turn-by-turn navigation on Expo SDK 57 with `expo-maps` and OSRM
- OSRM routing via `osrmBaseUrl`, or a pluggable `RouterAdapter` (`createOsrmRouterAdapter`)
- Turn banner, trip progress, mute, cancel (tears down GPS / simulation / TTS), voice guidance (`expo-speech`)
- Route simulation (`shouldSimulateRoute`, `simulationSpeedMultiplier`)
- Off-route detection and auto-reroute; multi-waypoint routes and alternate polylines
- Gated following camera with look-ahead bearing and free mode (pan to break follow; recenter / compass resume)
- Along-route arrive confirmation (Turf remaining distance, proximity caps, consecutive samples)
- Opt-in background location (`enableBackgroundLocation`)
- Course-up camera patch under `patches/` plus host guide (`docs/course-up-patch.md`)
- Locale packs for chrome and maneuver TTS; public types including `BottomSheetProps`
- Example app and Maestro flows under `example/`
