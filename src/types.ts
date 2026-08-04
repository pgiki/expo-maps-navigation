import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { Language } from './locals';
import type { RouterAdapter } from './router/types';

export type Coordinate = {
  latitude: number;
  longitude: number;
};

/**
 * Custom map marker image compatible with expo-maps `icon`
 * (typically from `expo-image` `useImage()` SharedRef).
 */
export type MapMarkerImage = unknown;

export type MarkerStyle = {
  /**
   * Custom marker / annotation image (expo-maps `icon` SharedRef).
   * Prefer this for branded pins on both platforms.
   */
  icon?: MapMarkerImage;
  /** Alias for `icon`. */
  image?: MapMarkerImage;
  /**
   * iOS SF Symbol name when no custom image is provided.
   * @platform ios
   */
  systemImage?: string;
  /** iOS marker tint (and annotation accent when supported). */
  tintColor?: string;
};

/**
 * Origin, destination, or any labeled map point with optional marker chrome.
 * Same styling surface as waypoints (`icon` / `systemImage` / `tintColor` / `name`).
 */
export type RoutePoint = Coordinate &
  MarkerStyle & {
    /** Callout / feedback label. */
    name?: string;
    /**
     * Alias for `name` (historically used as `title` on the end point).
     * Prefer `name` for new code.
     */
    title?: string;
  };

export type Waypoint = RoutePoint & {
  /**
   * Indicates whether the `onArrive` event is triggered when reaching the waypoint effectively.
   * @Default true
   */
  separatesLegs?: boolean;
};

export type WaypointEvent = Coordinate & {
  /**
   * Name of Waypoint if provided or index of legs/waypoint
   * @available iOS
   **/
  name?: string;
  /**
   * Index of legs/waypoint
   * @available Android
   **/
  index?: number;
};

export type Location = {
  latitude: number;
  longitude: number;
  heading: number;
  accuracy: number;
  /** Ground speed in metres per second (0 if unknown). */
  speed?: number;
};

export type NativeEvent<T> = {
  nativeEvent: T;
};

export type RouteProgress = {
  distanceTraveled: number;
  durationRemaining: number;
  fractionTraveled: number;
  distanceRemaining: number;
};

export type MapNavigationEvent = {
  message?: string;
};

/**
 * Props passed to a custom {@link MapNavigationProps.BottomSheet} component.
 *
 * `ExpoMapsNavigation` injects: `durationRemaining`, `distanceRemaining`,
 * `distanceUnit`, `language`, `showCancelButton`, `showAltRoutesButton`,
 * `bottomInset`, `onCancel`, and `onCycleRoutes`.
 *
 * `onSearchPress` is part of this shape for custom UIs that mirror the built-in
 * trip progress bar API; it is **not** injected by the host today — implement
 * search inside your sheet if needed.
 */
export type BottomSheetProps = {
  /** Seconds remaining on the active route. */
  durationRemaining: number;
  /** Metres remaining on the active route. */
  distanceRemaining: number;
  distanceUnit?: 'metric' | 'imperial';
  language?: Language;
  /** Whether the sheet should offer a cancel control. */
  showCancelButton?: boolean;
  /**
   * When true, show an alt-route cycle control (OSRM returned alternatives).
   * Wire to {@link BottomSheetProps.onCycleRoutes}.
   */
  showAltRoutesButton?: boolean;
  /** Safe-area bottom inset for padding the sheet. */
  bottomInset?: number;
  /**
   * Optional search handler (built-in bar shows an unavailable alert if unset).
   * Not currently passed by `ExpoMapsNavigation`.
   */
  onSearchPress?: () => void;
  /** Stops navigation (GPS / sim / TTS) and fires `onCancelNavigation`. */
  onCancel?: () => void;
  /** Cycle to the next alternate route when alternatives exist. */
  onCycleRoutes?: () => void;
};

/**
 * @deprecated Prefer the flat callbacks on {@link MapNavigationProps}.
 * Kept for transitional typings only.
 */
export type NativeEventsProps = {
  onLocationChange?: (event: NativeEvent<Location>) => void;
  onRouteProgressChange?: (event: NativeEvent<RouteProgress>) => void;
  onError?: (event: NativeEvent<MapNavigationEvent>) => void;
  onCancelNavigation?: (event: NativeEvent<MapNavigationEvent>) => void;
  onArrive?: (event: NativeEvent<WaypointEvent>) => void;
};

export interface MapNavigationProps {
  /** Flex container for the full-screen map and navigation chrome. */
  style?: StyleProp<ViewStyle>;
  /** Silences turn-by-turn TTS when true. */
  mute?: boolean;
  /**
   * Show a cancel control on the bottom sheet (or a floating cancel when
   * `hideStatusView` is also true).
   */
  showCancelButton?: boolean;
  /**
   * Trip start. Marker props: `name`, `icon`/`image`, iOS `systemImage`, `tintColor`.
   * When `icon` is omitted, a packaged geometric start marker (circle) is used.
   */
  startPoint: RoutePoint;
  waypoints?: Waypoint[];
  /**
   * Trip end. Same marker surface as waypoints (`name`/`title`, `icon`, …).
   * Default packaged marker is a geometric square when `icon` is omitted.
   */
  endPoint: RoutePoint;
  /** Chrome + maneuver TTS locale (see `Language`). */
  language?: Language;
  distanceUnit?: 'metric' | 'imperial';

  /**
   * Custom style for the live user location puck
   * (`icon`/`image` SharedRef, or iOS `systemImage` + `tintColor`).
   */
  userMarker?: MarkerStyle;

  /**
   * Mode of travel for navigation.
   *
   * - `driving`: OSRM `driving` profile (no live traffic).
   * - `driving-traffic`: **Alias of `driving`** on the default OSRM adapter
   *   (public OSRM has no traffic). Use a custom `router` for real traffic.
   * - `walking`: OSRM `foot`.
   * - `cycling`: OSRM `bike`.
   *
   * @Default "driving"
   */
  travelMode?: 'driving' | 'driving-traffic' | 'walking' | 'cycling';

  /**
   * Show end-of-route feedback overlay when arriving.
   * @Default false
   */
  showsEndOfRouteFeedback?: boolean;

  /**
   * Hide the bottom trip progress / status bar (custom or built-in).
   * With `showCancelButton`, cancel becomes a floating control instead.
   * @Default false
   */
  hideStatusView?: boolean;

  /**
   * Location simulation for debug (walks the route polyline).
   * @Default false
   */
  shouldSimulateRoute?: boolean;

  /**
   * Multiplier applied to simulated travel speed (e.g. 20 for fast E2E tests).
   * Only used when `shouldSimulateRoute` is true.
   * @Default 1
   */
  simulationSpeedMultiplier?: number;

  /**
   * Automatically recalculate when the device leaves the route corridor (live GPS).
   * Disabled during route simulation.
   * @Default true
   */
  rerouteEnabled?: boolean;

  /**
   * OSRM router base URL (no trailing slash required).
   * ⚠️ Default public demo server is unsuitable for production traffic.
   * @Default "https://router.project-osrm.org"
   */
  osrmBaseUrl?: string;

  /**
   * When true, refuse to start if `osrmBaseUrl` is still the public demo host
   * (unless a custom `router` is provided). Useful for production builds.
   * @Default false
   */
  requireOsrmBaseUrl?: boolean;

  /**
   * Custom routing backend (Mapbox / Google / self-hosted). When set, replaces
   * the default OSRM HTTP client for initial route + reroutes.
   */
  router?: RouterAdapter;

  /**
   * Opt-in background location updates (requires host Info.plist / Android
   * foreground service config — see `docs/background-location.md`).
   * @Default false
   */
  enableBackgroundLocation?: boolean;

  /**
   * Custom bottom status sheet (`ComponentType<BottomSheetProps>`).
   * Defaults to the built-in trip progress bar. Hide entirely with
   * `hideStatusView`. See {@link BottomSheetProps} for injected fields.
   */
  BottomSheet?: ComponentType<BottomSheetProps>;

  onLocationChange?: (location: Location) => void;
  onRouteProgressChange?: (progress: RouteProgress) => void;
  onError?: (error: MapNavigationEvent) => void;
  onCancelNavigation?: (event: MapNavigationEvent) => void;
  /** Fired when the user arrives at a waypoint. */
  onArrive?: (point: WaypointEvent) => void;
  /** Fired when off-route is confirmed (before the new route is fetched). */
  onOffRoute?: (location: Location) => void;
  /** Fired after a successful automatic reroute. */
  onReroute?: (info: { location: Location }) => void;
  /** Fired when an automatic reroute request fails. */
  onRerouteFailed?: (info: { message: string }) => void;
  /**
   * When set, shows a menu FAB in the right HUD stack (`testID="menu-button"`).
   * Omit to hide the control. Use for a host drawer / trip options sheet.
   */
  onPressMenu?: () => void;
}
