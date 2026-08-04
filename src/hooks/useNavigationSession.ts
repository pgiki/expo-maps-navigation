import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';

import type {
  Location as NavLocation,
  RouteProgress,
  RoutePoint,
  Waypoint,
  WaypointEvent,
} from '../types';
import type { OsrmRoute } from '../osrm/client';
import {
  computeRemaining,
  interpolateAlongPolyline,
  polylineLengthMeters,
  resolveCurrentStep,
} from '../osrm/progress';
import {
  courseAlongRoute,
  distanceToRouteMeters,
  isOffRouteSample,
  OFF_ROUTE_CONSECUTIVE,
  OFF_ROUTE_THRESHOLD_M,
  REROUTE_COOLDOWN_MS,
} from '../osrm/offRoute';
import { NavigationSmoother } from '../geo/smoothNavigation';
import { resolveHeading } from '../geo/heading';
import {
  ARRIVE_ALONG_REMAINING_M,
  arriveStreakRequired,
  evaluateArriveSample,
} from '../geo/arriveConfirmation';
import { useLatestRef } from './useLatestRef';

/** Used to suppress off-route near the destination. */
const ARRIVE_OFFROUTE_GUARD_M = ARRIVE_ALONG_REMAINING_M;
const TICK_MS = 250;

type TravelMode = 'driving' | 'driving-traffic' | 'walking' | 'cycling';

function speedForMode(mode: TravelMode): number {
  switch (mode) {
    case 'walking':
      return 1.4;
    case 'cycling':
      return 5;
    default:
      return 13;
  }
}

type UseNavigationSessionArgs = {
  route: OsrmRoute | null;
  waypoints?: Waypoint[];
  endPoint: RoutePoint;
  shouldSimulateRoute?: boolean;
  /** Multiplier for simulated speed. @Default 1 */
  simulationSpeedMultiplier?: number;
  mute?: boolean;
  travelMode?: TravelMode;
  enabled?: boolean;
  /** Automatic off-route detection (live GPS only). @Default true */
  rerouteEnabled?: boolean;
  /** True while a reroute network request is in flight (suppress duplicate triggers). */
  rerouteInFlight?: boolean;
  /** Opt-in background location (host must configure OS permissions). */
  enableBackgroundLocation?: boolean;
  onLocationChange?: (location: NavLocation) => void;
  onRouteProgressChange?: (progress: RouteProgress) => void;
  onArrive?: (point: WaypointEvent) => void;
  onError?: (message: string) => void;
  /** Fired once after consecutive off-route samples (debounced). */
  onOffRoute?: (location: NavLocation) => void;
};

export type NavigationSessionState = {
  location: NavLocation | null;
  stepIndex: number;
  progress: RouteProgress | null;
  distanceToNextManeuver: number;
  arrived: boolean;
  currentInstruction: string;
  offRoute: boolean;
  distanceFromRouteM: number;
};

export function useNavigationSession({
  route,
  waypoints = [],
  endPoint,
  shouldSimulateRoute = false,
  simulationSpeedMultiplier = 1,
  mute = false,
  travelMode = 'driving',
  enabled = true,
  rerouteEnabled = true,
  rerouteInFlight = false,
  enableBackgroundLocation = false,
  onLocationChange,
  onRouteProgressChange,
  onArrive,
  onError,
  onOffRoute,
}: UseNavigationSessionArgs): NavigationSessionState {
  const [location, setLocation] = useState<NavLocation | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState<RouteProgress | null>(null);
  const [distanceToNextManeuver, setDistanceToNextManeuver] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [offRoute, setOffRoute] = useState(false);
  const [distanceFromRouteM, setDistanceFromRouteM] = useState(0);

  const stepIndexRef = useRef(0);
  const simDistanceRef = useRef(0);
  const arrivedWaypointKeysRef = useRef<Set<string>>(new Set());
  /** Consecutive arrive-candidate samples per target key. */
  const arriveStreakRef = useRef<Map<string, number>>(new Map());
  const lastSpokenStepRef = useRef(-1);
  const muteRef = useLatestRef(mute);

  const offRouteStreakRef = useRef(0);
  const lastRerouteAtRef = useRef(0);
  const lastHeadingRef = useRef(0);
  const smootherRef = useRef<NavigationSmoother | null>(null);
  if (smootherRef.current === null) {
    smootherRef.current = new NavigationSmoother();
  }
  const smoother = smootherRef.current;
  const arrivedRef = useRef(false);
  const shouldSimulateRef = useLatestRef(shouldSimulateRoute);
  const rerouteEnabledRef = useLatestRef(rerouteEnabled);
  const rerouteInFlightRef = useLatestRef(rerouteInFlight);

  const onLocationChangeRef = useLatestRef(onLocationChange);
  const onRouteProgressChangeRef = useLatestRef(onRouteProgressChange);
  const onArriveRef = useLatestRef(onArrive);
  const onErrorRef = useLatestRef(onError);
  const onOffRouteRef = useLatestRef(onOffRoute);

  const currentInstruction = route?.steps[stepIndex]?.instruction ?? '';

  // Tear down speech when session disabled (e.g. cancel)
  useEffect(() => {
    if (!enabled) {
      Speech.stop();
    }
  }, [enabled]);

  // Speak on step change
  useEffect(() => {
    if (!route || !enabled) return;
    const step = route.steps[stepIndex];
    if (!step) return;
    if (lastSpokenStepRef.current === stepIndex) return;
    lastSpokenStepRef.current = stepIndex;
    if (!muteRef.current && step.instruction) {
      Speech.stop();
      Speech.speak(step.instruction, { rate: 1.0 });
    }
  }, [stepIndex, route, enabled, muteRef]);

  // Mute stops speech immediately
  useEffect(() => {
    if (mute) Speech.stop();
  }, [mute]);

  // Seed start pose on mount. Parent remounts this hook via `key` on route change.
  useEffect(() => {
    if (!route?.polyline[0]) return;
    const start = route.polyline[0];
    const course = courseAlongRoute(start, route.polyline) ?? 0;
    lastHeadingRef.current = course;
    smoother.reset(start, course);
    setLocation({
      latitude: start.latitude,
      longitude: start.longitude,
      heading: course,
      accuracy: 5,
      speed: 0,
    });
    lastRerouteAtRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processPosition = (
    pos: NavLocation,
    activeRoute: OsrmRoute,
    tickTravelM = 0
  ) => {
    // Off-route uses raw GPS; puck/camera use smoothed snap; arrive uses both via Turf.
    const rawForArrive = pos;

    const headingIn = resolveHeading(pos.heading, lastHeadingRef.current);
    const smoothed = smoother.update(
      {
        latitude: pos.latitude,
        longitude: pos.longitude,
        heading: headingIn,
        accuracy: pos.accuracy,
        speed: pos.speed,
      },
      activeRoute.polyline,
      OFF_ROUTE_THRESHOLD_M
    );

    lastHeadingRef.current = smoothed.heading;
    const resolved: NavLocation = {
      latitude: smoothed.latitude,
      longitude: smoothed.longitude,
      heading: smoothed.heading,
      accuracy: pos.accuracy,
      speed: pos.speed,
    };
    setLocation(resolved);
    onLocationChangeRef.current?.(resolved);

    const nextStep = resolveCurrentStep(
      activeRoute.steps,
      resolved,
      stepIndexRef.current
    );
    if (nextStep !== stepIndexRef.current) {
      stepIndexRef.current = nextStep;
      setStepIndex(nextStep);
    }

    const rem = computeRemaining(
      activeRoute.steps,
      stepIndexRef.current,
      resolved,
      activeRoute.distanceM,
      activeRoute.durationS,
      activeRoute.polyline
    );

    const progressPayload: RouteProgress = {
      distanceTraveled: rem.distanceTraveled,
      durationRemaining: rem.durationRemaining,
      fractionTraveled: rem.fractionTraveled,
      distanceRemaining: rem.distanceRemaining,
    };
    setProgress(progressPayload);
    setDistanceToNextManeuver(rem.distanceToNextManeuver);
    onRouteProgressChangeRef.current?.(progressPayload);

    const streakNeeded = arriveStreakRequired(shouldSimulateRef.current);

    const tryConfirmArrive = (
      key: string,
      target: { latitude: number; longitude: number },
      event: WaypointEvent
    ) => {
      if (arrivedWaypointKeysRef.current.has(key)) return;

      const sample = evaluateArriveSample({
        raw: rawForArrive,
        smoothed: resolved,
        accuracyM: pos.accuracy,
        polyline: activeRoute.polyline,
        target,
        routeDistanceM: activeRoute.distanceM,
        tickTravelM,
      });

      if (!sample.candidate) {
        arriveStreakRef.current.set(key, 0);
        return;
      }

      const next = (arriveStreakRef.current.get(key) ?? 0) + 1;
      arriveStreakRef.current.set(key, next);
      if (next < streakNeeded) return;

      arrivedWaypointKeysRef.current.add(key);
      arriveStreakRef.current.set(key, 0);
      if (key === 'destination') {
        arrivedRef.current = true;
        setArrived(true);
      }
      onArriveRef.current?.(event);
    };

    waypoints.forEach((wp, i) => {
      if (wp.separatesLegs === false) return;
      const key = `wp-${i}`;
      tryConfirmArrive(key, wp, {
        latitude: wp.latitude,
        longitude: wp.longitude,
        name: wp.name ?? String(i),
        index: i,
      });
    });

    // OSRM "arrive" steps (end of each leg) — still require Turf confirmation
    const currentStep = activeRoute.steps[stepIndexRef.current];
    if (
      currentStep?.maneuver.type === 'arrive' &&
      currentStep.legIndex < (activeRoute.waypoints.length - 2 || 0)
    ) {
      const wp = waypoints[currentStep.legIndex];
      if (wp && wp.separatesLegs !== false) {
        const key = `wp-${currentStep.legIndex}`;
        tryConfirmArrive(key, wp, {
          latitude: wp.latitude,
          longitude: wp.longitude,
          name: wp.name ?? String(currentStep.legIndex),
          index: currentStep.legIndex,
        });
      }
    }

    // Final destination
    tryConfirmArrive('destination', endPoint, {
      latitude: endPoint.latitude,
      longitude: endPoint.longitude,
      name: endPoint.name ?? endPoint.title ?? 'Destination',
      index: waypoints.length,
    });

    // Off-route detection — live GPS only (sim is glued to the polyline)
    if (
      !shouldSimulateRef.current &&
      rerouteEnabledRef.current &&
      !arrivedRef.current &&
      rem.distanceRemaining > ARRIVE_OFFROUTE_GUARD_M
    ) {
      const distFromRoute = distanceToRouteMeters(
        rawForArrive,
        activeRoute.polyline
      );
      setDistanceFromRouteM(distFromRoute);

      const sampleOff = isOffRouteSample(
        distFromRoute,
        rawForArrive.accuracy
      );
      if (sampleOff) {
        offRouteStreakRef.current += 1;
        setOffRoute(true);
      } else {
        offRouteStreakRef.current = 0;
        setOffRoute(false);
      }

      const cooledDown =
        Date.now() - lastRerouteAtRef.current >= REROUTE_COOLDOWN_MS;
      if (
        sampleOff &&
        offRouteStreakRef.current >= OFF_ROUTE_CONSECUTIVE &&
        cooledDown &&
        !rerouteInFlightRef.current
      ) {
        lastRerouteAtRef.current = Date.now();
        onOffRouteRef.current?.(rawForArrive);
      }
    } else if (shouldSimulateRef.current) {
      setOffRoute(false);
      setDistanceFromRouteM(0);
      offRouteStreakRef.current = 0;
    }
  };

  // Simulation loop
  useEffect(() => {
    if (!enabled || !route || !shouldSimulateRoute) return;

    const speed =
      speedForMode(travelMode) * Math.max(0.1, simulationSpeedMultiplier);
    const totalLen =
      polylineLengthMeters(route.polyline) || route.distanceM;
    const tickTravelM = speed * (TICK_MS / 1000);
    const interval = setInterval(() => {
      simDistanceRef.current = Math.min(
        totalLen,
        simDistanceRef.current + tickTravelM
      );
      const { position, heading } = interpolateAlongPolyline(
        route.polyline,
        simDistanceRef.current
      );
      processPosition(
        {
          latitude: position.latitude,
          longitude: position.longitude,
          heading,
          accuracy: 5,
          speed,
        },
        route,
        tickTravelM
      );
      if (simDistanceRef.current >= totalLen) {
        // Snap to destination so arrive always fires at end of sim
        const endHeading = heading;
        smoother.reset(
          {
            latitude: endPoint.latitude,
            longitude: endPoint.longitude,
          },
          endHeading
        );
        processPosition(
          {
            latitude: endPoint.latitude,
            longitude: endPoint.longitude,
            heading: endHeading,
            accuracy: 5,
            speed: 0,
          },
          route,
          tickTravelM
        );
        clearInterval(interval);
      }
    }, TICK_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    route,
    shouldSimulateRoute,
    travelMode,
    simulationSpeedMultiplier,
  ]);

  // Live GPS
  useEffect(() => {
    if (!enabled || !route || shouldSimulateRoute) return;

    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { status } =
          await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          onErrorRef.current?.('Location permission is not granted.');
          return;
        }

        if (enableBackgroundLocation) {
          try {
            await Location.requestBackgroundPermissionsAsync();
          } catch {
            // Host may not have configured background modes — continue foreground.
          }
        }

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: TICK_MS,
            distanceInterval: 1,
            ...(enableBackgroundLocation
              ? {
                  // May be ignored without host OS config; see docs/background-location.md
                  mayShowUserSettingsDialog: true,
                }
              : {}),
          },
          (loc: Location.LocationObject) => {
            if (cancelled || !route) return;
            const courseFallback =
              courseAlongRoute(
                {
                  latitude: loc.coords.latitude,
                  longitude: loc.coords.longitude,
                },
                route.polyline
              ) ?? lastHeadingRef.current;
            processPosition(
              {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                heading: resolveHeading(loc.coords.heading, courseFallback),
                accuracy: loc.coords.accuracy ?? 0,
                speed:
                  loc.coords.speed != null && loc.coords.speed >= 0
                    ? loc.coords.speed
                    : undefined,
              },
              route
            );
          }
        );
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Failed to watch location.';
        onErrorRef.current?.(message);
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, route, shouldSimulateRoute, enableBackgroundLocation]);

  return {
    location,
    stepIndex,
    progress,
    distanceToNextManeuver,
    arrived,
    currentInstruction,
    offRoute,
    distanceFromRouteM,
  };
}
