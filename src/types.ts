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

/** Props passed to a custom {@link MapNavigationProps.BottomSheet} component. */
export type BottomSheetProps = {
  durationRemaining: number;
  distanceRemaining: number;
  distanceUnit?: 'metric' | 'imperial';
  language?: Language;
  showCancelButton?: boolean;
  /** Show alt-route cycle control when multiple routes exist. */
  showAltRoutesButton?: boolean;
  bottomInset?: number;
  onSearchPress?: () => void;
  onCancel?: () => void;
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
  style?: StyleProp<ViewStyle>;
  mute?: boolean;
  showCancelButton?: boolean;
  /** Trip start — same marker props as waypoints (`name`, `icon`, `systemImage`, …). */
  startPoint: RoutePoint;
  waypoints?: Waypoint[];
  /** Trip end — same marker props as waypoints (`name`/`title`, `icon`, `systemImage`, …). */
  endPoint: RoutePoint;
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
   * Hide the bottom trip progress / status bar.
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
   * Custom bottom status sheet. Receives remaining time/distance and cancel /
   * alt-route actions. Defaults to the built-in trip progress bar.
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
  /** Fired when the menu button is pressed. */
  onPressMenu?: () => void;
}
