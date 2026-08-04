import type { LatLng } from './instructions';
import {
  courseAlongRouteTurf,
  snapToRoute,
} from '../geo/smoothNavigation';

/** Mapbox iOS–style default: max meters from route before recalculating. */
export const OFF_ROUTE_THRESHOLD_M = 50;

/** Consecutive off-route GPS samples required before firing a reroute. */
export const OFF_ROUTE_CONSECUTIVE = 5;

/** Minimum continuous off-route duration (ms) before firing a reroute. */
export const OFF_ROUTE_MIN_DURATION_MS = 3000;

/** Assumed horizontal accuracy (m) when the OS reports none / ≤0. */
export const OFF_ROUTE_ASSUMED_ACCURACY_M = 30;

/** Minimum accuracy slack (m) added to the corridor threshold. */
export const OFF_ROUTE_MIN_ACCURACY_SLACK_M = 25;

/** Grace after a successful reroute before detecting off-route again. */
export const REROUTE_COOLDOWN_MS = 8000;

/** Backoff after a failed reroute before retrying. */
export const REROUTE_FAIL_BACKOFF_MS = 15000;

/** Suppress off-route detection at session / soft-swap start. */
export const REROUTE_STARTUP_GRACE_MS = 15000;

export type NearestPointResult = {
  point: LatLng;
  distanceM: number;
  segmentIndex: number;
  /** Interpolation factor along the winning segment [0, 1]. */
  t: number;
};

/**
 * Snap a coordinate to the nearest point on a polyline (Turf).
 */
export function nearestPointOnPolyline(
  point: LatLng,
  polyline: LatLng[]
): NearestPointResult | null {
  const snap = snapToRoute(point, polyline);
  if (!snap) return null;
  return {
    point: snap.point,
    distanceM: snap.distanceM,
    segmentIndex: snap.segmentIndex,
    t: 0,
  };
}

/** Distance in metres from `point` to the nearest location on `polyline`. */
export function distanceToRouteMeters(
  point: LatLng,
  polyline: LatLng[]
): number {
  const nearest = nearestPointOnPolyline(point, polyline);
  return nearest?.distanceM ?? Infinity;
}

/**
 * Bearing (degrees) of the nearest route segment under `point`.
 * Used for course-up camera so the puck faces along the road.
 */
export function courseAlongRoute(
  point: LatLng,
  polyline: LatLng[]
): number | null {
  return courseAlongRouteTurf(point, polyline);
}

/**
 * Effective off-route distance threshold for a GPS sample.
 * Adds accuracy slack so urban noise / unknown accuracy does not false-fire.
 */
export function effectiveOffRouteThresholdM(
  accuracyM = 0,
  thresholdM = OFF_ROUTE_THRESHOLD_M
): number {
  const reported =
    accuracyM > 0 ? accuracyM : OFF_ROUTE_ASSUMED_ACCURACY_M;
  return thresholdM + Math.max(reported, OFF_ROUTE_MIN_ACCURACY_SLACK_M);
}

/**
 * Whether a single GPS sample should count as off-route.
 * Threshold expands with reported (or assumed) horizontal accuracy.
 */
export function isOffRouteSample(
  distanceM: number,
  accuracyM = 0,
  thresholdM = OFF_ROUTE_THRESHOLD_M
): boolean {
  return distanceM > effectiveOffRouteThresholdM(accuracyM, thresholdM);
}

/**
 * Whether consecutive off samples + continuous duration are enough to fire.
 */
export function isOffRouteConfirmed(input: {
  streak: number;
  offSinceMs: number;
  nowMs?: number;
  consecutive?: number;
  minDurationMs?: number;
}): boolean {
  const now = input.nowMs ?? Date.now();
  const consecutive = input.consecutive ?? OFF_ROUTE_CONSECUTIVE;
  const minDuration = input.minDurationMs ?? OFF_ROUTE_MIN_DURATION_MS;
  if (input.streak < consecutive) return false;
  if (input.offSinceMs <= 0) return false;
  return now - input.offSinceMs >= minDuration;
}
