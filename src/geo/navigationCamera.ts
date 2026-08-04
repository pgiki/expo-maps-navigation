import type { LatLng } from '../osrm/instructions';
import { bearingDegrees, distanceMeters } from '../osrm/progress';

/** Min ground movement before a following camera frame (metres). */
export const FOLLOW_MIN_MOVE_M = 12;

/** Min heading change before a following camera frame (degrees). */
export const FOLLOW_MIN_BEARING_DEG = 15;

/** Min time between following frames on Android (ms). */
export const FOLLOW_MIN_INTERVAL_ANDROID_MS = 700;

/** Min time between following frames on iOS (ms) — longer because updates are jumps. */
export const FOLLOW_MIN_INTERVAL_IOS_MS = 900;

/** Below this speed, freeze the camera (puck may still micro-adjust). */
export const FOLLOW_IDLE_SPEED_MPS = 0.5;

/** Look-ahead blend kicks in when the next maneuver is within this distance. */
export const LOOK_AHEAD_DISTANCE_M = 120;

/** Max deviation from course toward upcoming geometry (Mapbox-style). */
export const LOOK_AHEAD_MAX_ANGLE_DEG = 45;

export type FollowingPlatform = 'ios' | 'android' | 'web' | 'windows' | 'macos';

export function followMinIntervalMs(
  platform: FollowingPlatform = 'ios'
): number {
  return platform === 'ios'
    ? FOLLOW_MIN_INTERVAL_IOS_MS
    : FOLLOW_MIN_INTERVAL_ANDROID_MS;
}

/** Android camera animation duration — shorter than the follow interval. */
export function followAndroidDurationMs(
  platform: FollowingPlatform = 'android'
): number {
  const interval = followMinIntervalMs(platform);
  // Leave headroom so programmaticMoveGuardMs expires before the next frame,
  // giving user pans a window to enter free mode (Google-style).
  return Math.min(Math.max(interval - 180, 400), 800);
}

/**
 * How long to ignore `onCameraMove` after a programmatic camera update.
 * Must expire before the next follow frame so a user pan can enter free mode,
 * but cover Android animation settle.
 */
export function programmaticMoveGuardMs(
  platform: FollowingPlatform,
  animationDurationMs = 0
): number {
  if (platform === 'android') {
    const interval = followMinIntervalMs(platform);
    // Cap below the follow interval so guards never permanently overlap frames.
    return Math.min(
      Math.max(animationDurationMs + 60, 360),
      interval - 80
    );
  }
  // iOS setCameraPosition is a jump — brief settle only.
  return 280;
}

/**
 * Speed-aware move threshold: slightly looser when walking, tighter interval
 * is handled separately for highway.
 */
export function followMoveThresholdM(speedMps = 0): number {
  if (speedMps > 0 && speedMps < 2) return Math.max(6, FOLLOW_MIN_MOVE_M * 0.6);
  return FOLLOW_MIN_MOVE_M;
}

export function followIntervalForSpeedMs(
  platform: FollowingPlatform,
  speedMps = 0
): number {
  const base = followMinIntervalMs(platform);
  // Highway: fewer frames so animations can finish.
  if (speedMps >= 25) return Math.round(base * 1.35);
  return base;
}

export function bearingDeltaDeg(a: number, b: number): number {
  return Math.abs(((b - a + 540) % 360) - 180);
}

function shortestSignedDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/**
 * Blend corridor heading toward the next maneuver (clamped ±45°), similar to
 * Mapbox FollowingFrameOptions.BearingSmoothing.
 */
export function computeLookAheadBearing(
  courseHeading: number,
  location: LatLng,
  lookAheadPoint?: LatLng | null,
  maxDistanceM = LOOK_AHEAD_DISTANCE_M,
  maxAngleDeg = LOOK_AHEAD_MAX_ANGLE_DEG
): number {
  if (!lookAheadPoint) return ((courseHeading % 360) + 360) % 360;

  const dist = distanceMeters(location, lookAheadPoint);
  if (dist > maxDistanceM || dist < 1) {
    return ((courseHeading % 360) + 360) % 360;
  }

  const toManeuver = bearingDegrees(location, lookAheadPoint);
  const delta = shortestSignedDelta(courseHeading, toManeuver);
  const clamped = Math.max(-maxAngleDeg, Math.min(maxAngleDeg, delta));
  // Stronger blend as we approach the maneuver.
  const t = 1 - dist / maxDistanceM;
  const blend = clamped * (0.35 + 0.65 * t);
  return (courseHeading + blend + 360) % 360;
}

export type ShouldUpdateFollowingCameraInput = {
  lastPos: LatLng | null;
  lastBearing: number | null;
  lastAt: number;
  nextPos: LatLng;
  nextBearing: number;
  speedMps?: number;
  force?: boolean;
  now?: number;
  platform?: FollowingPlatform;
  /** Android: block while previous animation is still running. */
  animationDurationMs?: number;
};

export type ShouldUpdateFollowingCameraResult = {
  update: boolean;
  reason:
    | 'force'
    | 'idle'
    | 'interval'
    | 'animating'
    | 'insignificant'
    | 'move'
    | 'bearing'
    | 'first';
  movedM: number;
  turnedDeg: number;
  intervalMs: number;
};

/**
 * Decide whether a FOLLOWING camera frame should run.
 * Puck updates stay on every GPS tick; camera frames are gated here.
 */
export function shouldUpdateFollowingCamera(
  input: ShouldUpdateFollowingCameraInput
): ShouldUpdateFollowingCameraResult {
  const now = input.now ?? Date.now();
  const platform = input.platform ?? 'ios';
  const speed = input.speedMps ?? 0;
  const intervalMs = followIntervalForSpeedMs(platform, speed);
  const animMs = input.animationDurationMs ?? 0;

  if (input.force) {
    return {
      update: true,
      reason: 'force',
      movedM: 0,
      turnedDeg: 0,
      intervalMs,
    };
  }

  if (input.lastPos == null || input.lastBearing == null) {
    return {
      update: true,
      reason: 'first',
      movedM: 0,
      turnedDeg: 0,
      intervalMs,
    };
  }

  // Only freeze when speed is known and below idle. Unknown speed still uses
  // move / bearing / interval gates (common when GPS omits coords.speed).
  if (
    input.speedMps != null &&
    Number.isFinite(input.speedMps) &&
    input.speedMps < FOLLOW_IDLE_SPEED_MPS
  ) {
    return {
      update: false,
      reason: 'idle',
      movedM: 0,
      turnedDeg: 0,
      intervalMs,
    };
  }

  const elapsed = now - input.lastAt;
  if (elapsed < intervalMs) {
    return {
      update: false,
      reason: 'interval',
      movedM: 0,
      turnedDeg: 0,
      intervalMs,
    };
  }

  // Avoid stacking Android camera animations.
  if (animMs > 0 && elapsed < animMs) {
    return {
      update: false,
      reason: 'animating',
      movedM: 0,
      turnedDeg: 0,
      intervalMs,
    };
  }

  const movedM = distanceMeters(input.lastPos, input.nextPos);
  const turnedDeg = bearingDeltaDeg(input.lastBearing, input.nextBearing);
  const moveThreshold = followMoveThresholdM(speed);
  const significant =
    movedM >= moveThreshold || turnedDeg >= FOLLOW_MIN_BEARING_DEG;

  if (!significant) {
    return {
      update: false,
      reason: 'insignificant',
      movedM,
      turnedDeg,
      intervalMs,
    };
  }

  return {
    update: true,
    reason: movedM >= moveThreshold ? 'move' : 'bearing',
    movedM,
    turnedDeg,
    intervalMs,
  };
}
