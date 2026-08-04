import { describe, expect, it } from 'vitest';

import {
  FOLLOW_IDLE_SPEED_MPS,
  FOLLOW_MIN_BEARING_DEG,
  FOLLOW_MIN_INTERVAL_ANDROID_MS,
  FOLLOW_MIN_MOVE_M,
  LOOK_AHEAD_MAX_ANGLE_DEG,
  computeLookAheadBearing,
  followAndroidDurationMs,
  followMinIntervalMs,
  programmaticMoveGuardMs,
  shouldUpdateFollowingCamera,
} from '../geo/navigationCamera';

const origin = { latitude: 0, longitude: 0 };

/** ~111m per 0.001° latitude. */
function northOf(metres: number) {
  return { latitude: metres / 111_320, longitude: 0 };
}

describe('followMinIntervalMs', () => {
  it('uses a longer interval on iOS than Android', () => {
    expect(followMinIntervalMs('ios')).toBeGreaterThan(
      followMinIntervalMs('android')
    );
    expect(followMinIntervalMs('android')).toBe(FOLLOW_MIN_INTERVAL_ANDROID_MS);
  });
});

describe('followAndroidDurationMs', () => {
  it('does not exceed the follow interval', () => {
    expect(followAndroidDurationMs('android')).toBeLessThanOrEqual(
      followMinIntervalMs('android')
    );
  });
});

describe('programmaticMoveGuardMs', () => {
  it('stays shorter than the follow interval so user pans can enter free mode', () => {
    const androidGuard = programmaticMoveGuardMs(
      'android',
      followAndroidDurationMs('android')
    );
    const iosGuard = programmaticMoveGuardMs('ios', 0);
    expect(androidGuard).toBeLessThan(followMinIntervalMs('android'));
    expect(iosGuard).toBeLessThan(followMinIntervalMs('ios'));
  });
});

describe('shouldUpdateFollowingCamera', () => {
  const base = {
    lastPos: origin,
    lastBearing: 0,
    lastAt: 0,
    nextPos: northOf(FOLLOW_MIN_MOVE_M + 1),
    nextBearing: 0,
    platform: 'android' as const,
    now: FOLLOW_MIN_INTERVAL_ANDROID_MS + 50,
    speedMps: 10,
  };

  it('freezes when speed is known and idle', () => {
    const result = shouldUpdateFollowingCamera({
      ...base,
      speedMps: FOLLOW_IDLE_SPEED_MPS - 0.1,
    });
    expect(result.update).toBe(false);
    expect(result.reason).toBe('idle');
  });

  it('does not treat unknown speed as idle', () => {
    const result = shouldUpdateFollowingCamera({
      ...base,
      speedMps: undefined,
    });
    expect(result.update).toBe(true);
  });

  it('rejects sub-threshold move and small bearing after interval', () => {
    const result = shouldUpdateFollowingCamera({
      ...base,
      nextPos: northOf(FOLLOW_MIN_MOVE_M - 2),
      nextBearing: FOLLOW_MIN_BEARING_DEG - 2,
    });
    expect(result.update).toBe(false);
    expect(result.reason).toBe('insignificant');
  });

  it('updates when move ≥ threshold after interval', () => {
    const result = shouldUpdateFollowingCamera({
      ...base,
      nextPos: northOf(FOLLOW_MIN_MOVE_M + 2),
      nextBearing: 0,
    });
    expect(result.update).toBe(true);
    expect(result.reason).toBe('move');
  });

  it('updates when bearing ≥ threshold after interval', () => {
    const result = shouldUpdateFollowingCamera({
      ...base,
      nextPos: northOf(1),
      nextBearing: FOLLOW_MIN_BEARING_DEG + 1,
    });
    expect(result.update).toBe(true);
    expect(result.reason).toBe('bearing');
  });

  it('force bypasses idle and interval gates', () => {
    const result = shouldUpdateFollowingCamera({
      ...base,
      speedMps: 0,
      now: 1,
      force: true,
    });
    expect(result.update).toBe(true);
    expect(result.reason).toBe('force');
  });

  it('rejects updates inside the interval window', () => {
    const result = shouldUpdateFollowingCamera({
      ...base,
      now: 100,
    });
    expect(result.update).toBe(false);
    expect(result.reason).toBe('interval');
  });

  it('allows the first frame when lastPos is null', () => {
    const result = shouldUpdateFollowingCamera({
      ...base,
      lastPos: null,
      lastBearing: null,
      force: false,
    });
    expect(result.update).toBe(true);
    expect(result.reason).toBe('first');
  });
});

describe('computeLookAheadBearing', () => {
  it('returns course when no look-ahead point', () => {
    expect(computeLookAheadBearing(90, origin, null)).toBe(90);
  });

  it('clamps look-ahead within ±45° of course', () => {
    // Point due east while course is north → target bearing 90°, clamp to +45.
    const east = { latitude: 0, longitude: 0.0005 }; // ~55m east
    const blended = computeLookAheadBearing(0, origin, east);
    const delta = Math.abs(((blended - 0 + 540) % 360) - 180);
    expect(delta).toBeLessThanOrEqual(LOOK_AHEAD_MAX_ANGLE_DEG + 0.01);
    expect(blended).toBeGreaterThan(0);
    expect(blended).toBeLessThanOrEqual(LOOK_AHEAD_MAX_ANGLE_DEG);
  });

  it('ignores look-ahead beyond the distance window', () => {
    const farEast = { latitude: 0, longitude: 0.01 }; // ~1km
    expect(computeLookAheadBearing(0, origin, farEast)).toBe(0);
  });
});
