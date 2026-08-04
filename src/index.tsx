import ExpoMapsNavigation from './ExpoMapsNavigation';

export default ExpoMapsNavigation;
export { ExpoMapsNavigation };
/** Alias for {@link ExpoMapsNavigation}. */
export { ExpoMapsNavigation as MapNavigation };

export type {
  Coordinate,
  Waypoint,
  WaypointEvent,
  RoutePoint,
  Location,
  RouteProgress,
  MapNavigationEvent,
  MapNavigationProps,
  BottomSheetProps,
  NativeEvent,
  NativeEventsProps,
  MarkerStyle,
  MapMarkerImage,
} from './types';

export type { Language } from './locals';
export { speechLocale } from './locals';

export {
  DEFAULT_OSRM_BASE_URL,
  fetchOsrmRoute,
  fetchOsrmRoutes,
  fetchDrivingRoute,
  fetchWalkingRoute,
  OsrmError,
  isOsrmError,
  formatOsrmError,
} from './osrm/client';

export { travelModeToProfile } from './osrm/instructions';

export type {
  OsrmRoute,
  OsrmStep,
  OsrmProfile,
  LatLng,
  OsrmManeuver,
} from './osrm/instructions';

export {
  formatDistance,
  formatDuration,
  formatEta,
  resolveCurrentStep,
  zoomForSpanMeters,
  distanceMeters,
  distanceAlongRouteMeters,
  computeRemaining,
} from './osrm/progress';

export {
  nearestPointOnPolyline,
  distanceToRouteMeters,
  courseAlongRoute,
  isOffRouteSample,
  isOffRouteConfirmed,
  effectiveOffRouteThresholdM,
  OFF_ROUTE_THRESHOLD_M,
  OFF_ROUTE_CONSECUTIVE,
  OFF_ROUTE_MIN_DURATION_MS,
  REROUTE_COOLDOWN_MS,
  REROUTE_FAIL_BACKOFF_MS,
  REROUTE_STARTUP_GRACE_MS,
} from './osrm/offRoute';

export type { NearestPointResult } from './osrm/offRoute';

export {
  snapToRoute,
  courseAlongRouteTurf,
  NavigationSmoother,
  SMOOTH_LERP_ALPHA,
  SMOOTH_MOVE_GATE_M,
  SMOOTH_BEARING_GATE_DEG,
  SMOOTH_SNAP_THRESHOLD_M,
} from './geo/smoothNavigation';

export type {
  RouteSnapResult,
  SmoothLocationInput,
  SmoothLocationOutput,
} from './geo/smoothNavigation';

export {
  evaluateArriveSample,
  arriveProximityThreshold,
  arriveAlongRemainingThreshold,
  arriveStreakRequired,
  ARRIVE_PROXIMITY_M,
  ARRIVE_ALONG_REMAINING_M,
  ARRIVE_CONSECUTIVE,
  ARRIVE_PROXIMITY_CAP_M,
} from './geo/arriveConfirmation';

export type {
  ArriveSampleInput,
  ArriveSampleResult,
} from './geo/arriveConfirmation';

export type { RouterAdapter, RouterRequest } from './router/types';
export { createOsrmRouterAdapter } from './router/createOsrmRouterAdapter';
