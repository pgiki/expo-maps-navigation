import { point, lineString } from '@turf/helpers';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import turfBearing from '@turf/bearing';
import turfDistance from '@turf/distance';

import type { LatLng } from '../osrm/instructions';

export const SMOOTH_LERP_ALPHA = 0.32;
export const SMOOTH_MOVE_GATE_M = 4;
export const SMOOTH_BEARING_GATE_DEG = 10;
export const SMOOTH_IDLE_SPEED_MPS = 0.45;
/** Default snap corridor width (metres) — mirrors OFF_ROUTE_THRESHOLD_M. */
export const SMOOTH_SNAP_THRESHOLD_M = 50;

type Coord = [number, number];

function toCoord(p: LatLng): Coord {
  return [p.longitude, p.latitude];
}

function fromCoord(c: number[] | Coord): LatLng {
  return { longitude: c[0]!, latitude: c[1]! };
}

function circularLerp(from: number, to: number, alpha: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return (from + delta * alpha + 360) % 360;
}

export type RouteSnapResult = {
  point: LatLng;
  distanceM: number;
  segmentIndex: number;
  /** Distance along the line from the start (metres). */
  locationM: number;
};

/**
 * Snap a point to the nearest location on a polyline using Turf.
 */
export function snapToRoute(
  raw: LatLng,
  polyline: LatLng[]
): RouteSnapResult | null {
  if (polyline.length === 0) return null;
  if (polyline.length === 1) {
    const only = polyline[0]!;
    return {
      point: only,
      distanceM: turfDistance(point(toCoord(raw)), point(toCoord(only)), {
        units: 'meters',
      }),
      segmentIndex: 0,
      locationM: 0,
    };
  }

  const line = lineString(polyline.map(toCoord));
  const snapped = nearestPointOnLine(line, point(toCoord(raw)), {
    units: 'meters',
  });
  const coords = snapped.geometry.coordinates;
  const props = snapped.properties ?? {};
  return {
    point: fromCoord(coords),
    distanceM: typeof props.dist === 'number' ? props.dist : 0,
    segmentIndex: typeof props.index === 'number' ? props.index : 0,
    locationM: typeof props.location === 'number' ? props.location : 0,
  };
}

/**
 * Bearing (degrees) of the route corridor under `point`, via Turf snap + bearing.
 */
export function courseAlongRouteTurf(
  raw: LatLng,
  polyline: LatLng[]
): number | null {
  if (polyline.length < 2) return null;
  const snap = snapToRoute(raw, polyline);
  if (!snap) return null;
  const i = Math.min(snap.segmentIndex, polyline.length - 2);
  const a = polyline[i];
  const b = polyline[i + 1];
  if (!a || !b) return null;
  if (a.latitude === b.latitude && a.longitude === b.longitude) return null;
  return turfBearing(point(toCoord(a)), point(toCoord(b)));
}

export type SmoothLocationInput = {
  latitude: number;
  longitude: number;
  heading: number;
  accuracy?: number;
  speed?: number;
};

export type SmoothLocationOutput = SmoothLocationInput & {
  /** True when snapped travel since last publish cleared the movement gate. */
  moved: boolean;
};

/**
 * Soft-snaps GPS to the route and lerps the displayed puck / heading.
 * Off-route samples stay on raw coordinates; on-route samples ease onto the polyline.
 *
 * Heading is always the smoothed corridor course when on-route — camera throttling
 * in NavigationMap is responsible for avoiding flicker, not a second heading gate.
 */
export class NavigationSmoother {
  private display: LatLng | null = null;
  private heading = 0;
  private lastGatePos: LatLng | null = null;
  private travelSinceGate = 0;
  private initialized = false;

  reset(pos: LatLng, heading: number) {
    this.display = { ...pos };
    this.heading = heading;
    this.lastGatePos = { ...pos };
    this.travelSinceGate = 0;
    this.initialized = true;
  }

  update(
    raw: SmoothLocationInput,
    polyline: LatLng[],
    snapThresholdM = SMOOTH_SNAP_THRESHOLD_M
  ): SmoothLocationOutput {
    const rawPos: LatLng = {
      latitude: raw.latitude,
      longitude: raw.longitude,
    };

    if (!this.initialized || !this.display) {
      const course = courseAlongRouteTurf(rawPos, polyline);
      const heading =
        course != null
          ? course
          : Number.isFinite(raw.heading) && raw.heading >= 0
            ? raw.heading
            : 0;
      this.reset(rawPos, heading);
      return {
        ...raw,
        latitude: rawPos.latitude,
        longitude: rawPos.longitude,
        heading,
        moved: true,
      };
    }

    const snap = snapToRoute(rawPos, polyline);
    const onRoute = snap != null && snap.distanceM <= snapThresholdM;
    const speed = raw.speed ?? 0;
    const movingFast = speed >= SMOOTH_IDLE_SPEED_MPS;

    const nextTarget = onRoute && snap ? snap.point : rawPos;
    const toTargetM = turfDistance(
      point(toCoord(this.display)),
      point(toCoord(nextTarget)),
      { units: 'meters' }
    );

    // Idle GPS jitter: do not chase sub-metre snap noise when stopped.
    if (!movingFast && toTargetM < 1.25) {
      // keep display
    } else {
      const alpha = SMOOTH_LERP_ALPHA;
      this.display = {
        latitude:
          this.display.latitude +
          (nextTarget.latitude - this.display.latitude) * alpha,
        longitude:
          this.display.longitude +
          (nextTarget.longitude - this.display.longitude) * alpha,
      };
    }

    let desiredHeading = this.heading;
    if (onRoute) {
      const course = courseAlongRouteTurf(this.display, polyline);
      if (course != null) desiredHeading = course;
    } else if (Number.isFinite(raw.heading) && raw.heading >= 0) {
      desiredHeading = raw.heading;
    }

    // Track course tightly when moving; hold when idle to avoid spin.
    const headingAlpha = movingFast || onRoute ? 0.45 : 0.12;
    this.heading = circularLerp(this.heading, desiredHeading, headingAlpha);

    if (this.lastGatePos) {
      this.travelSinceGate = turfDistance(
        point(toCoord(this.lastGatePos)),
        point(toCoord(this.display)),
        { units: 'meters' }
      );
    }

    const moved =
      this.travelSinceGate >= SMOOTH_MOVE_GATE_M || movingFast;
    if (moved) {
      this.lastGatePos = { ...this.display };
      this.travelSinceGate = 0;
    }

    return {
      ...raw,
      latitude: this.display.latitude,
      longitude: this.display.longitude,
      heading: this.heading,
      moved,
    };
  }
}
