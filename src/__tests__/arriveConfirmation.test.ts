import { describe, expect, it } from 'vitest';

import {
  ARRIVE_PROXIMITY_CAP_M,
  ARRIVE_PROXIMITY_M,
  arriveProximityThreshold,
  arriveStreakForSample,
  arriveStreakRequired,
  evaluateArriveSample,
} from '../geo/arriveConfirmation';

/** Long eastbound corridor (~2km). */
const corridor = [
  { latitude: 0, longitude: 0 },
  { latitude: 0, longitude: 0.01 },
  { latitude: 0, longitude: 0.02 },
];

const destination = corridor[2]!;

describe('evaluateArriveSample', () => {
  it('rejects mid-route when crow-flies near a parallel target but along-route remaining is high', () => {
    // Point near the middle of the corridor — destination is still ~half the route away.
    const mid = { latitude: 0, longitude: 0.01 };
    // Fake "close" crow-flies by using a target near mid while polyline still goes to dest —
    // use destination as target: mid is ~1km along, remaining large.
    const result = evaluateArriveSample({
      raw: mid,
      smoothed: mid,
      accuracyM: 5,
      polyline: corridor,
      target: destination,
      routeDistanceM: 2220,
      tickTravelM: 0,
    });
    expect(result.alongRemainingM).toBeGreaterThan(500);
    expect(result.candidate).toBe(false);
  });

  it('confirms when near the end with low along-route remaining', () => {
    const nearEnd = { latitude: 0, longitude: 0.01995 };
    const result = evaluateArriveSample({
      raw: nearEnd,
      smoothed: nearEnd,
      accuracyM: 5,
      polyline: corridor,
      target: destination,
      routeDistanceM: 2220,
      tickTravelM: 0,
    });
    expect(result.proximityM).toBeLessThan(ARRIVE_PROXIMITY_CAP_M);
    expect(result.alongRemainingM).toBeLessThan(50);
    expect(result.candidate).toBe(true);
  });

  it('blocks early geofence when proximity is small but corridor remaining is large', () => {
    // Crow-flies close to destination (shortcut) but snap is still on the first leg.
    const L = [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0.02 },
      { latitude: 0.01, longitude: 0.02 },
    ];
    const dest = L[2]!;
    const stillOnFirstLeg = { latitude: 0, longitude: 0.015 };
    const early = evaluateArriveSample({
      raw: {
        latitude: dest.latitude - 0.00008,
        longitude: dest.longitude,
      },
      smoothed: stillOnFirstLeg,
      accuracyM: 5,
      polyline: L,
      target: dest,
      routeDistanceM: 3000,
      tickTravelM: 0,
    });
    // Smoothed snap should keep along-remaining high → not a candidate
    expect(early.alongRemainingM).toBeGreaterThan(100);
    expect(early.candidate).toBe(false);
  });

  it('confirms mid-corridor waypoints when along-distance to that target is low', () => {
    const wp = corridor[1]!;
    const nearWp = { latitude: 0, longitude: 0.01002 };
    const result = evaluateArriveSample({
      raw: nearWp,
      smoothed: nearWp,
      accuracyM: 5,
      polyline: corridor,
      target: wp,
      routeDistanceM: 2220,
      tickTravelM: 0,
    });
    expect(result.alongRemainingM).toBeLessThan(ARRIVE_PROXIMITY_CAP_M);
    expect(result.candidate).toBe(true);
  });

  it('caps accuracy-inflated proximity threshold', () => {
    expect(arriveProximityThreshold(100)).toBe(ARRIVE_PROXIMITY_CAP_M);
    expect(arriveProximityThreshold(0)).toBe(ARRIVE_PROXIMITY_M);
    expect(arriveProximityThreshold(20)).toBe(ARRIVE_PROXIMITY_M);
    // Sim expands proximity with tick travel
    expect(arriveProximityThreshold(5, 80)).toBeGreaterThan(ARRIVE_PROXIMITY_CAP_M);
  });

  it('allows sim tick catch only when remaining is within tick window', () => {
    const mid = { latitude: 0, longitude: 0.01 };
    const midResult = evaluateArriveSample({
      raw: mid,
      smoothed: mid,
      accuracyM: 5,
      polyline: corridor,
      target: destination,
      routeDistanceM: 2220,
      tickTravelM: 80,
    });
    // Mid-route remaining >> 80m catch window
    expect(midResult.candidate).toBe(false);

    const nearEnd = { latitude: 0, longitude: 0.01995 };
    const endResult = evaluateArriveSample({
      raw: nearEnd,
      smoothed: nearEnd,
      accuracyM: 5,
      polyline: corridor,
      target: destination,
      routeDistanceM: 2220,
      tickTravelM: 80,
    });
    expect(endResult.alongRemainingM).toBeLessThanOrEqual(80);
    expect(endResult.candidate).toBe(true);
  });
});

describe('arriveStreakRequired', () => {
  it('requires one sample for simulation and three for live GPS', () => {
    expect(arriveStreakRequired(true)).toBe(1);
    expect(arriveStreakRequired(false)).toBe(3);
  });
});

describe('arriveStreakForSample', () => {
  it('collapses to one sample at the destination when remaining is low', () => {
    expect(
      arriveStreakForSample({
        isSimulation: false,
        key: 'destination',
        alongRemainingM: 10,
        routeDistanceRemainingM: 12,
      })
    ).toBe(1);
  });

  it('keeps the live streak for mid-trip waypoints', () => {
    expect(
      arriveStreakForSample({
        isSimulation: false,
        key: 'wp-0',
        alongRemainingM: 10,
        routeDistanceRemainingM: 800,
      })
    ).toBe(3);
  });
});
