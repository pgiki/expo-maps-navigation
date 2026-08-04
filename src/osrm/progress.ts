import { t } from '../i18n/strings';
import type { Language } from '../locals';
import { snapToRoute } from '../geo/smoothNavigation';
import type { OsrmStep } from './instructions';
import type { LatLng } from './instructions';

/** Map zoom that roughly frames a straight-line distance between two points. */
export function zoomForSpanMeters(metres: number): number {
  if (metres < 80) return 18;
  if (metres < 200) return 17;
  if (metres < 500) return 16;
  if (metres < 1200) return 15;
  if (metres < 3000) return 14;
  if (metres < 7000) return 13;
  return 12;
}

/** Haversine distance in metres. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Bearing in degrees from a → b. */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(a.latitude);
  const φ2 = toRad(b.latitude);
  const Δλ = toRad(b.longitude - a.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Find which step the driver is currently on given current position. */
export function resolveCurrentStep(
  steps: OsrmStep[],
  driverPos: LatLng,
  currentIdx: number
): number {
  if (steps.length === 0) return 0;
  let bestIdx = currentIdx;
  let bestDist = Infinity;
  const end = Math.min(currentIdx + 4, steps.length - 1);
  for (let i = currentIdx; i <= end; i++) {
    const s = steps[i];
    if (!s) continue;
    const d = distanceMeters(driverPos, s.coordinates);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  // Advance when close to the *next* step start
  const next = steps[currentIdx + 1];
  if (next && distanceMeters(driverPos, next.coordinates) < 35) {
    return Math.max(bestIdx, currentIdx + 1);
  }
  return bestIdx;
}

/**
 * Distance along `polyline` from its start to the snap of `pos` (metres).
 */
export function distanceAlongRouteMeters(
  polyline: LatLng[],
  pos: LatLng
): number {
  const snap = snapToRoute(pos, polyline);
  return snap?.locationM ?? 0;
}

/**
 * Remaining distance/duration using along-route (Turf snap) distance when a
 * polyline is provided; falls back to step haversine otherwise.
 */
export function computeRemaining(
  steps: OsrmStep[],
  stepIdx: number,
  pos: LatLng,
  totalDistanceM: number,
  totalDurationS: number,
  polyline?: LatLng[]
): {
  distanceRemaining: number;
  durationRemaining: number;
  distanceTraveled: number;
  fractionTraveled: number;
  distanceToNextManeuver: number;
} {
  if (steps.length === 0) {
    return {
      distanceRemaining: 0,
      durationRemaining: 0,
      distanceTraveled: totalDistanceM,
      fractionTraveled: 1,
      distanceToNextManeuver: 0,
    };
  }

  const routeLen =
    totalDistanceM > 0
      ? totalDistanceM
      : polyline
        ? polylineLengthMeters(polyline)
        : 0;

  let distanceTraveled: number;
  let distanceRemaining: number;
  let fractionTraveled: number;

  if (polyline && polyline.length >= 2 && routeLen > 0) {
    distanceTraveled = Math.min(
      routeLen,
      Math.max(0, distanceAlongRouteMeters(polyline, pos))
    );
    distanceRemaining = Math.max(0, routeLen - distanceTraveled);
    fractionTraveled = Math.min(1, distanceTraveled / routeLen);
  } else {
    // Legacy step-sum fallback
    distanceRemaining = 0;
    let durationSum = 0;
    for (let i = stepIdx; i < steps.length; i++) {
      const s = steps[i];
      if (!s) continue;
      distanceRemaining += s.distance;
      durationSum += s.duration;
    }
    const current = steps[stepIdx];
    if (current) {
      const intoStep = distanceMeters(current.coordinates, pos);
      const clamped = Math.min(intoStep, current.distance);
      distanceRemaining = Math.max(0, distanceRemaining - clamped);
    }
    distanceTraveled = Math.max(0, totalDistanceM - distanceRemaining);
    fractionTraveled =
      totalDistanceM > 0
        ? Math.min(1, Math.max(0, distanceTraveled / totalDistanceM))
        : 0;
    void durationSum;
  }

  let durationRemaining =
    totalDurationS > 0
      ? Math.max(0, totalDurationS * (1 - fractionTraveled))
      : 0;

  // Prefer step-based duration when totals are missing
  if (durationRemaining === 0) {
    for (let i = stepIdx; i < steps.length; i++) {
      const s = steps[i];
      if (!s) continue;
      durationRemaining += s.duration;
    }
  }

  const current = steps[stepIdx];
  const next = steps[stepIdx + 1];
  let distanceToNextManeuver = current?.distance ?? 0;

  if (polyline && polyline.length >= 2 && next) {
    const at = distanceAlongRouteMeters(polyline, pos);
    const nextAt = distanceAlongRouteMeters(polyline, next.coordinates);
    distanceToNextManeuver = Math.max(0, nextAt - at);
  } else if (current) {
    const intoStep = distanceMeters(current.coordinates, pos);
    const clamped = Math.min(intoStep, current.distance);
    if (next) {
      distanceToNextManeuver = distanceMeters(pos, next.coordinates);
    } else {
      distanceToNextManeuver = Math.max(0, current.distance - clamped);
    }
  }

  return {
    distanceRemaining,
    durationRemaining,
    distanceTraveled,
    fractionTraveled,
    distanceToNextManeuver,
  };
}

/** Format metres to display string. */
export function formatDistance(
  metres: number,
  unit: 'metric' | 'imperial' = 'metric'
): string {
  if (unit === 'imperial') {
    const feet = metres * 3.28084;
    if (feet < 1000) return `${Math.round(feet)} ft`;
    const miles = metres / 1609.344;
    return `${miles.toFixed(1)} mi`;
  }
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

/** Format seconds to display string. */
export function formatDuration(
  seconds: number,
  language: Language = 'en'
): string {
  if (seconds < 60) return t('lessThanOneMin', language);
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

/** ETA clock time from remaining seconds. */
export function formatEta(durationRemainingS: number): string {
  const eta = new Date(Date.now() + durationRemainingS * 1000);
  return eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Interpolate along a polyline by distance traveled (metres). */
export function interpolateAlongPolyline(
  polyline: LatLng[],
  distanceM: number
): { position: LatLng; heading: number; index: number } {
  if (polyline.length === 0) {
    return {
      position: { latitude: 0, longitude: 0 },
      heading: 0,
      index: 0,
    };
  }
  if (polyline.length === 1) {
    return { position: polyline[0]!, heading: 0, index: 0 };
  }

  let remaining = Math.max(0, distanceM);
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i]!;
    const b = polyline[i + 1]!;
    const seg = distanceMeters(a, b);
    if (remaining <= seg || i === polyline.length - 2) {
      const t = seg > 0 ? Math.min(1, remaining / seg) : 0;
      return {
        position: {
          latitude: a.latitude + (b.latitude - a.latitude) * t,
          longitude: a.longitude + (b.longitude - a.longitude) * t,
        },
        heading: bearingDegrees(a, b),
        index: i,
      };
    }
    remaining -= seg;
  }

  const last = polyline[polyline.length - 1]!;
  const prev = polyline[polyline.length - 2]!;
  return {
    position: last,
    heading: bearingDegrees(prev, last),
    index: polyline.length - 2,
  };
}

export function polylineLengthMeters(polyline: LatLng[]): number {
  let total = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    total += distanceMeters(polyline[i]!, polyline[i + 1]!);
  }
  return total;
}
