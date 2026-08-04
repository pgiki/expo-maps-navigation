import { describe, expect, it } from 'vitest';

import {
  effectiveOffRouteThresholdM,
  isOffRouteConfirmed,
  isOffRouteSample,
  OFF_ROUTE_ASSUMED_ACCURACY_M,
  OFF_ROUTE_CONSECUTIVE,
  OFF_ROUTE_MIN_DURATION_MS,
  OFF_ROUTE_THRESHOLD_M,
  REROUTE_COOLDOWN_MS,
  REROUTE_FAIL_BACKOFF_MS,
  REROUTE_STARTUP_GRACE_MS,
} from '../osrm/offRoute';

describe('isOffRouteSample', () => {
  it('flags distances beyond threshold + accuracy slack', () => {
    // effective = 50 + max(5, 25) = 75
    expect(isOffRouteSample(10, 5)).toBe(false);
    expect(isOffRouteSample(80, 5)).toBe(true);
  });

  it('expands threshold with reported accuracy', () => {
    // effective = 50 + max(50, 25) = 100
    expect(isOffRouteSample(60, 50)).toBe(false);
    expect(isOffRouteSample(120, 50)).toBe(true);
  });

  it('assumes accuracy when OS reports none', () => {
    const effective = effectiveOffRouteThresholdM(0);
    expect(effective).toBe(
      OFF_ROUTE_THRESHOLD_M +
        Math.max(OFF_ROUTE_ASSUMED_ACCURACY_M, 25)
    );
    expect(isOffRouteSample(effective - 1, 0)).toBe(false);
    expect(isOffRouteSample(effective + 1, 0)).toBe(true);
  });
});

describe('isOffRouteConfirmed', () => {
  it('requires both consecutive samples and min duration', () => {
    const now = 10_000;
    expect(
      isOffRouteConfirmed({
        streak: OFF_ROUTE_CONSECUTIVE,
        offSinceMs: now - 500,
        nowMs: now,
      })
    ).toBe(false);

    expect(
      isOffRouteConfirmed({
        streak: OFF_ROUTE_CONSECUTIVE - 1,
        offSinceMs: now - OFF_ROUTE_MIN_DURATION_MS,
        nowMs: now,
      })
    ).toBe(false);

    expect(
      isOffRouteConfirmed({
        streak: OFF_ROUTE_CONSECUTIVE,
        offSinceMs: now - OFF_ROUTE_MIN_DURATION_MS,
        nowMs: now,
      })
    ).toBe(true);
  });

  it('rejects when offSince is unset', () => {
    expect(
      isOffRouteConfirmed({
        streak: 99,
        offSinceMs: 0,
        nowMs: Date.now(),
      })
    ).toBe(false);
  });
});

describe('reroute cooldown constants', () => {
  it('uses longer fail backoff than success cooldown', () => {
    expect(REROUTE_FAIL_BACKOFF_MS).toBeGreaterThan(REROUTE_COOLDOWN_MS);
    expect(REROUTE_STARTUP_GRACE_MS).toBeGreaterThanOrEqual(
      REROUTE_COOLDOWN_MS
    );
  });
});
