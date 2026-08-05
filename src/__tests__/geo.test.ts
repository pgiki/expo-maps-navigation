import { describe, expect, it } from 'vitest';

import {
  courseAlongRouteTurf,
  NavigationSmoother,
  SMOOTH_TELEPORT_CATCHUP_M,
  snapToRoute,
} from '../geo/smoothNavigation';
import { isOffRouteSample } from '../osrm/offRoute';
import {
  computeRemaining,
  distanceAlongRouteMeters,
} from '../osrm/progress';
import { resolveHeading } from '../geo/heading';
import type { OsrmStep } from '../osrm/instructions';

const line = [
  { latitude: 0, longitude: 0 },
  { latitude: 0, longitude: 0.01 },
  { latitude: 0, longitude: 0.02 },
];

describe('snapToRoute', () => {
  it('snaps a nearby point onto the polyline', () => {
    const raw = { latitude: 0.0005, longitude: 0.01 };
    const snap = snapToRoute(raw, line);
    expect(snap).not.toBeNull();
    expect(snap!.distanceM).toBeLessThan(100);
    expect(snap!.point.longitude).toBeCloseTo(0.01, 3);
  });
});

describe('courseAlongRouteTurf', () => {
  it('returns eastward bearing on an eastbound line', () => {
    const course = courseAlongRouteTurf(
      { latitude: 0, longitude: 0.005 },
      line
    );
    expect(course).not.toBeNull();
    // ~90° east
    expect(course!).toBeGreaterThan(60);
    expect(course!).toBeLessThan(120);
  });
});

describe('isOffRouteSample', () => {
  it('flags distances beyond the threshold + accuracy slack', () => {
    expect(isOffRouteSample(10, 5)).toBe(false);
    expect(isOffRouteSample(80, 5)).toBe(true);
  });

  it('expands threshold with accuracy', () => {
    expect(isOffRouteSample(60, 50)).toBe(false);
  });
});

describe('computeRemaining along-route', () => {
  const steps: OsrmStep[] = [
    {
      name: 'A',
      distance: 500,
      duration: 50,
      maneuver: { type: 'depart' },
      coordinates: line[0]!,
      instruction: 'Go',
      legIndex: 0,
    },
    {
      name: 'B',
      distance: 500,
      duration: 50,
      maneuver: { type: 'arrive' },
      coordinates: line[2]!,
      instruction: 'Arrive',
      legIndex: 0,
    },
  ];

  it('uses Turf location along the polyline for remaining distance', () => {
    const mid = { latitude: 0, longitude: 0.005 };
    const along = distanceAlongRouteMeters(line, mid);
    expect(along).toBeGreaterThan(0);

    const rem = computeRemaining(steps, 0, mid, 2000, 100, line);
    expect(rem.distanceTraveled).toBeGreaterThan(100);
    expect(rem.distanceRemaining).toBeLessThan(1900);
    expect(rem.fractionTraveled).toBeGreaterThan(0.05);
    expect(rem.fractionTraveled).toBeLessThan(0.75);
  });
});

describe('resolveHeading', () => {
  it('keeps fallback for unknown headings', () => {
    expect(resolveHeading(-1, 42)).toBe(42);
    expect(resolveHeading(Number.NaN, 10)).toBe(10);
    expect(resolveHeading(undefined, 7)).toBe(7);
    expect(resolveHeading(90, 0)).toBe(90);
  });
});

describe('NavigationSmoother teleport catch-up', () => {
  it(`snaps display when the next target is ≥ ${SMOOTH_TELEPORT_CATCHUP_M}m away`, () => {
    const smoother = new NavigationSmoother();
    smoother.reset({ latitude: 0, longitude: 0 }, 90);
    const far = { latitude: 0, longitude: 0.001 }; // ~111m east
    const out = smoother.update(
      { ...far, heading: 90, accuracy: 5, speed: 0 },
      line
    );
    expect(out.longitude).toBeCloseTo(far.longitude, 5);
    expect(out.latitude).toBeCloseTo(far.latitude, 5);
  });
});
