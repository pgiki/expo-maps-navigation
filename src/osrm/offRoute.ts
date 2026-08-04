import type { LatLng } from './instructions';
import {
  courseAlongRouteTurf,
  snapToRoute,
} from '../geo/smoothNavigation';

/** Mapbox iOS–style default: max meters from route before recalculating. */
export const OFF_ROUTE_THRESHOLD_M = 50;

/** Consecutive off-route GPS samples required before firing a reroute. */
export const OFF_ROUTE_CONSECUTIVE = 3;

/** Grace period after a reroute attempt before detecting off-route again. */
export const REROUTE_COOLDOWN_MS = 8000;

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
 * Whether a single GPS sample should count as off-route.
 * Threshold expands with reported horizontal accuracy.
 */
export function isOffRouteSample(
  distanceM: number,
  accuracyM = 0,
  thresholdM = OFF_ROUTE_THRESHOLD_M
): boolean {
  const effective = Math.max(thresholdM, (accuracyM || 0) * 1.5);
  return distanceM > effective;
}
