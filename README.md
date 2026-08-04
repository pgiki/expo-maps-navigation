# expo-maps-navigation

Turn-by-turn navigation for Expo apps using **expo-maps** and **OSRM**.

> Requires a [development build](https://docs.expo.dev/develop/development-builds/introduction/) — `expo-maps` is not available in Expo Go.

> **Production warning:** The default `osrmBaseUrl` (`https://router.project-osrm.org`) is a **public demo** with no SLA or rate guarantees. Self-host OSRM (or pass a custom `router`) before shipping. Use `requireOsrmBaseUrl` to refuse the demo host in production builds.

## Features

- `ExpoMapsNavigation` component with turn-by-turn props and events
- OSRM routing via `osrmBaseUrl` (or pluggable `RouterAdapter`)
- Turn-by-turn banner, trip progress, mute, cancel (tears down GPS / sim / TTS)
- Voice guidance via `expo-speech`
- Route simulation (`shouldSimulateRoute`, `simulationSpeedMultiplier`)
- Off-route detection + auto-reroute (`rerouteEnabled`, `onOffRoute` / `onReroute`)
- Multi-waypoint support + alternate route polylines
- Apple Maps (iOS) / Google Maps (Android) via `expo-maps`
- Optional background location (`enableBackgroundLocation` — see [docs/background-location.md](docs/background-location.md))

## Install

```sh
npx expo install expo-maps-navigation expo-maps expo-location expo-speech expo-image
npx expo install lucide-react-native react-native-svg
# optional peers
npx expo install expo-keep-awake react-native-safe-area-context
```

Peers are pinned to **Expo SDK 57** ranges (`expo-maps ~57.0.1`, etc.). **`react-native-svg` is required** by `lucide-react-native` (HUD icons).

> **npm note:** If `npm publish` fails because the name is an unpublished tombstone, reclaim or choose a scoped name (e.g. `@fikachu/expo-maps-navigation`) before the first release.

Configure Android Google Maps API key and the `expo-maps` config plugin per [Expo Maps docs](https://docs.expo.dev/versions/latest/sdk/maps/).

### Develop from source

Clone the repo and link the example via `file:..` — see [CONTRIBUTING.md](CONTRIBUTING.md).
### Course-up camera (bearing)

`expo-maps` 57 does not apply camera `bearing` in `setCameraPosition` by default. Apply the shipped patch **and** force `expo-maps` to build from source — see **[docs/course-up-patch.md](docs/course-up-patch.md)**. Without it, navigation stays north-up (everything else still works). Upstream tracking: [docs/upstream-bearing.md](docs/upstream-bearing.md).

While navigating, the **location puck** updates on every GPS sample; the **following camera** only animates when a frame gate passes (enough movement or heading change, min interval, not idle). Bearing can soften toward the next maneuver (look-ahead, clamped ±45°). On iOS, camera updates are discrete jumps (expo-maps has no `duration`); Android uses a non-overlapping animation duration aligned with the follow interval.

Panning the map enters **free mode** (follow stops; a recenter control appears). Tapping **Recenter** or the compass animates the camera to the current location and resumes follow-my-location.

```sh
npm i -D patch-package
# copy patches/expo-maps+57.0.1.patch into your app's patches/
# add "postinstall": "patch-package"
# add expo.autolinking.buildFromSource: ["expo-maps"] (SDK 57 XCFramework ignores Swift patches)
npx expo prebuild && cd ios && pod install && cd .. && npx expo run:ios
```

## Usage

```tsx
import ExpoMapsNavigation from 'expo-maps-navigation';
import { StyleSheet } from 'react-native';

export default function App() {
  return (
    <ExpoMapsNavigation
      startPoint={{ latitude: 30.699239, longitude: 76.6905161 }}
      endPoint={{
        latitude: 30.709241,
        longitude: 76.695669,
        name: 'Pickup',
      }}
      waypoints={[
        {
          latitude: 30.701982,
          longitude: 76.693183,
          name: 'Waypoint 1',
          separatesLegs: true,
        },
      ]}
      travelMode="driving"
      osrmBaseUrl="https://your-osrm.example.com"
      style={styles.container}
      shouldSimulateRoute
      showCancelButton
      language="en"
      distanceUnit="metric"
      onCancelNavigation={() => {}}
      onArrive={(point) => console.log('arrived', point)}
      onRouteProgressChange={(p) => console.log(p)}
      onOffRoute={(loc) => console.log('off route', loc)}
      onReroute={({ location }) => console.log('rerouted', location)}
      onError={(e) => console.warn(e.message)}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
```

### Custom router

```tsx
import ExpoMapsNavigation, {
  createOsrmRouterAdapter,
  type RouterAdapter,
} from 'expo-maps-navigation';

const router: RouterAdapter = createOsrmRouterAdapter(
  'https://your-osrm.example.com'
);
// Or implement fetchRoutes() against Mapbox / Google / etc.

<ExpoMapsNavigation router={router} /* ... */ />;
```

## API

Primary export: **`ExpoMapsNavigation`**. Alias: `MapNavigation` (same component).

Also exported: types such as `BottomSheetProps`, `RouterAdapter`, helpers like `createOsrmRouterAdapter`.

## Props

| Prop | Notes |
| --- | --- |
| `startPoint` / `endPoint` / `waypoints` | Required start & end; optional vias. Marker props: `name` (prefer over `title`), `icon`/`image`, iOS `systemImage`, `tintColor`. Android gets packaged default pin PNGs when `icon` is omitted. |
| `userMarker` | Live puck style (`icon` SharedRef or iOS `systemImage`) |
| `osrmBaseUrl` | OSRM base URL. **Do not ship the public demo for production.** |
| `requireOsrmBaseUrl` | When true, errors if still on the public demo host (unless `router` is set) |
| `router` | Pluggable `RouterAdapter` (replaces default OSRM HTTP client) |
| `travelMode` | `driving` / `driving-traffic` (alias of driving on OSRM) / `walking` / `cycling` |
| `shouldSimulateRoute` | Walks the polyline |
| `simulationSpeedMultiplier` | Sim speed factor (e.g. `20` for E2E) |
| `rerouteEnabled` | Auto-reroute on live GPS off-route (`true` by default; off during sim) |
| `enableBackgroundLocation` | Opt-in background updates — see docs |
| `mute` | Silences TTS |
| `showCancelButton` | Cancel control (stops GPS/sim/TTS, then `onCancelNavigation`) |
| `distanceUnit` | `metric` \| `imperial` |
| `language` | Chrome + maneuver TTS locale packs |
| `showsEndOfRouteFeedback` | Arrived overlay |
| `hideStatusView` | Hides bottom progress card |
| `onLocationChange` | `{ latitude, longitude, heading, accuracy, speed? }` |
| `onRouteProgressChange` | Along-route distance / duration / fraction |
| `onArrive` | Destination and separating waypoints — Turf along-route remaining + proximity + consecutive GPS samples (sim confirms at polyline end) |
| `onOffRoute` / `onReroute` / `onRerouteFailed` | Corridor leave + recalculation |
| `onCancelNavigation` / `onError` | User cancel / failures (`OsrmError` detail in message) |

## Example & Maestro E2E

The sample app lives in [`example/`](example/). Flows are in [`example/maestro/`](example/maestro/).

```sh
cd example

# Terminal A — Metro (use a free port if 8081 is taken)
npx expo start --port 8084

# Terminal B — install + launch (first time)
npx expo prebuild --platform ios
npx expo run:ios --device "iPhone 17" --port 8084

# Run flows (wrapper sets jsLocation so Metro on 8084 is used)
npm run maestro:ios
```

Covered:

- Start → mute → cancel teardown → home
- Fast simulation → arrive overlay → Done → home
- Course-up camera bearing (requires patch)
- Forced `onError` via bad OSRM URL

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please read the [Code of Conduct](CODE_OF_CONDUCT.md) and [Security policy](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE). Changelog: [CHANGELOG.md](CHANGELOG.md).
