import { point } from '@turf/helpers';
import turfDistance from '@turf/distance';

import type { LatLng } from '../osrm/instructions';
import { polylineLengthMeters } from '../osrm/progress';
import { snapToRoute } from './smoothNavigation';

/** Live GPS proximity to target (metres). */
export const ARRIVE_PROXIMITY_M = 25;

/** Max along-route remaining distance to confirm arrive (metres). */
export const ARRIVE_ALONG_REMAINING_M = 25;

/** Consecutive candidate samples required (live GPS). */
export const ARRIVE_CONSECUTIVE = 3;

/** Cap on accuracy-inflated proximity threshold (metres). */
export const ARRIVE_PROXIMITY_CAP_M = 25;

export type ArriveSampleInput = {
  raw: LatLng;
  smoothed: LatLng;
  accuracyM?: number;
  polyline: LatLng[];
  target: LatLng;
  routeDistanceM: number;
  /** Per-tick travel (sim); 0 / omit for live GPS. */
  tickTravelM?: number;
};

export type ArriveSampleResult = {
  candidate: boolean;
  proximityM: number;
  alongRemainingM: number;
  proximityThresholdM: number;
  alongRemainingThresholdM: number;
};

function toCoord(p: LatLng): [number, number] {
  return [p.longitude, p.latitude];
}

function metresBetween(a: LatLng, b: LatLng): number {
  return turfDistance(point(toCoord(a)), point(toCoord(b)), {
    units: 'meters',
  });
}

/**
 * Proximity threshold: base ARRIVE_PROXIMITY_M, expand with half of reported
 * accuracy, capped. Simulation may expand further with tick travel.
 */
export function arriveProximityThreshold(
  accuracyM = 0,
  tickTravelM = 0
): number {
  const live = Math.min(
    ARRIVE_PROXIMITY_CAP_M,
    Math.max(ARRIVE_PROXIMITY_M, (accuracyM || 0) * 0.5)
  );
  if (tickTravelM > 0) {
    return Math.max(live, Math.min(tickTravelM * 1.25, 120));
  }
  return live;
}

/**
 * Along-route remaining threshold. Sim jumps may use tick travel as a catch
 * window so high-speed simulation still confirms only near the true end.
 */
export function arriveAlongRemainingThreshold(tickTravelM = 0): number {
  return Math.max(ARRIVE_ALONG_REMAINING_M, tickTravelM || 0);
}

/**
 * Turf-backed arrive candidate: proximity to target AND low remaining distance
 * along the route corridor toward that target (blocks early geofence on
 * shortcuts / parallel streets).
 */
export function evaluateArriveSample(
  input: ArriveSampleInput
): ArriveSampleResult {
  const {
    raw,
    smoothed,
    accuracyM = 0,
    polyline,
    target,
    routeDistanceM,
    tickTravelM = 0,
  } = input;

  const snapSmoothed = snapToRoute(smoothed, polyline);
  const snapRaw = snapToRoute(raw, polyline);
  const snap = snapSmoothed ?? snapRaw;
  const targetSnap = snapToRoute(target, polyline);
  const routeLen =
    routeDistanceM > 0
      ? routeDistanceM
      : polylineLengthMeters(polyline);

  let alongRemainingM = Infinity;
  if (targetSnap) {
    const remS = snapSmoothed
      ? Math.abs(targetSnap.locationM - snapSmoothed.locationM)
      : Infinity;
    const remR = snapRaw
      ? Math.abs(targetSnap.locationM - snapRaw.locationM)
      : Infinity;
    // Live GPS: trust smoothed corridor position (blocks shortcut geofences).
    // Simulation: also consider raw so end-of-route snaps confirm while the smoother lags.
    alongRemainingM =
      tickTravelM > 0 ? Math.min(remS, remR) : remS !== Infinity ? remS : remR;
  } else if (snap && routeLen > 0) {
    alongRemainingM = Math.max(0, routeLen - snap.locationM);
  } else if (snap) {
    alongRemainingM = metresBetween(snap.point, target);
  }

  const proximityCandidates = [
    metresBetween(raw, target),
    metresBetween(smoothed, target),
  ];
  if (snapSmoothed) {
    proximityCandidates.push(metresBetween(snapSmoothed.point, target));
  }
  if (snapRaw) {
    proximityCandidates.push(metresBetween(snapRaw.point, target));
  }
  const proximityM = Math.min(...proximityCandidates);

  const proximityThresholdM = arriveProximityThreshold(accuracyM, tickTravelM);
  const alongRemainingThresholdM =
    arriveAlongRemainingThreshold(tickTravelM);

  const candidate =
    Number.isFinite(alongRemainingM) &&
    proximityM <= proximityThresholdM &&
    alongRemainingM <= alongRemainingThresholdM;

  return {
    candidate,
    proximityM,
    alongRemainingM: Number.isFinite(alongRemainingM)
      ? alongRemainingM
      : Infinity,
    proximityThresholdM,
    alongRemainingThresholdM,
  };
}

/**
 * Required consecutive candidate samples before firing `onArrive`.
 * Simulation uses 1 so end-of-polyline snaps confirm immediately for E2E.
 */
export function arriveStreakRequired(isSimulation: boolean): number {
  return isSimulation ? 1 : ARRIVE_CONSECUTIVE;
}

/**
 * Streak needed for this sample. At the destination with a clear arrive
 * candidate, require only one sample — live GPS often goes idle once stopped
 * (especially on iOS), so a 3-sample streak would never complete.
 */
export function arriveStreakForSample(input: {
  isSimulation: boolean;
  key: string;
  alongRemainingM: number;
  routeDistanceRemainingM: number;
}): number {
  const base = arriveStreakRequired(input.isSimulation);
  if (
    input.key === 'destination' &&
    input.alongRemainingM <= ARRIVE_ALONG_REMAINING_M &&
    input.routeDistanceRemainingM <= ARRIVE_ALONG_REMAINING_M
  ) {
    return 1;
  }
  return base;
}
