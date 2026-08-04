import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';

import type {
  Location as NavLocation,
  RouteProgress,
  RoutePoint,
  Waypoint,
  WaypointEvent,
} from '../types';
import type { Language } from '../locals';
import { speechLocale } from '../locals';
import type { OsrmRoute } from '../osrm/client';
import {
  computeRemaining,
  distanceAlongRouteMeters,
  interpolateAlongPolyline,
  polylineLengthMeters,
  resolveCurrentStep,
} from '../osrm/progress';
import {
  courseAlongRoute,
  distanceToRouteMeters,
  isOffRouteConfirmed,
  isOffRouteSample,
  OFF_ROUTE_THRESHOLD_M,
  REROUTE_COOLDOWN_MS,
  REROUTE_FAIL_BACKOFF_MS,
  REROUTE_STARTUP_GRACE_MS,
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
/** Skip progress UI updates when remaining distance delta is below this (m). */
const PROGRESS_UI_EPSILON_M = 2;

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
  /** Bumps on intentional route replace — soft-swaps session without remount. */
  routeGeneration?: number;
  waypoints?: Waypoint[];
  endPoint: RoutePoint;
  shouldSimulateRoute?: boolean;
  /** Multiplier for simulated speed. @Default 1 */
  simulationSpeedMultiplier?: number;
  mute?: boolean;
  language?: Language;
  travelMode?: TravelMode;
  enabled?: boolean;
  /** Automatic off-route detection (live GPS only). @Default true */
  rerouteEnabled?: boolean;
  /** Opt-in background location (host must configure OS permissions). */
  enableBackgroundLocation?: boolean;
  onLocationChange?: (location: NavLocation) => void;
  onRouteProgressChange?: (progress: RouteProgress) => void;
  onArrive?: (point: WaypointEvent) => void;
  onError?: (message: string) => void;
  /** Fired once after confirmed off-route (time + samples). */
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
  /** Call when a reroute network attempt finishes (starts cooldown). */
  notifyRerouteSettled: (ok: boolean) => void;
};

export function useNavigationSession({
  route,
  routeGeneration = 0,
  waypoints = [],
  endPoint,
  shouldSimulateRoute = false,
  simulationSpeedMultiplier = 1,
  mute = false,
  language = 'en',
  travelMode = 'driving',
  enabled = true,
  rerouteEnabled = true,
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
  const languageRef = useLatestRef(language);

  const offRouteStreakRef = useRef(0);
  const offRouteSinceRef = useRef(0);
  const lastRerouteAtRef = useRef(0);
  const cooldownMsRef = useRef(REROUTE_STARTUP_GRACE_MS);
  /** Sync in-flight guard (set in event / settle paths, not during render). */
  const reroutePendingRef = useRef(false);
  const lastHeadingRef = useRef(0);
  const lastProgressRemainingRef = useRef<number | null>(null);
  const locationRef = useRef<NavLocation | null>(null);
  const seededGenerationRef = useRef<number | null>(null);
  const smootherRef = useRef<NavigationSmoother | null>(null);
  if (smootherRef.current === null) {
    smootherRef.current = new NavigationSmoother();
  }
  const smoother = smootherRef.current;
  const arrivedRef = useRef(false);
  const shouldSimulateRef = useLatestRef(shouldSimulateRoute);
  const rerouteEnabledRef = useLatestRef(rerouteEnabled);
  // GPS/sim callbacks are async; effect-synced refs are current by the next tick.
  const routeRef = useLatestRef(route);
  const waypointsListRef = useLatestRef(waypoints);
  const endPointRef = useLatestRef(endPoint);

  const onLocationChangeRef = useLatestRef(onLocationChange);
  const onRouteProgressChangeRef = useLatestRef(onRouteProgressChange);
  const onArriveRef = useLatestRef(onArrive);
  const onErrorRef = useLatestRef(onError);
  const onOffRouteRef = useLatestRef(onOffRoute);

  const currentInstruction = route?.steps[stepIndex]?.instruction ?? '';

  const notifyRerouteSettled = useCallback((ok: boolean) => {
    reroutePendingRef.current = false;
    lastRerouteAtRef.current = Date.now();
    cooldownMsRef.current = ok
      ? REROUTE_COOLDOWN_MS
      : REROUTE_FAIL_BACKOFF_MS;
    offRouteStreakRef.current = 0;
    offRouteSinceRef.current = 0;
  }, []);

  // Tear down speech when session disabled (e.g. cancel) or unmount
  useEffect(() => {
    if (!enabled) {
      Speech.stop();
    }
    return () => {
      Speech.stop();
    };
  }, [enabled]);

  // Speak on step change (skip while muted; muteRef is sync so races cannot speak)
  useEffect(() => {
    if (!route || !enabled) return;
    const step = route.steps[stepIndex];
    if (!step) return;
    if (lastSpokenStepRef.current === stepIndex) return;
    lastSpokenStepRef.current = stepIndex;
    // Advance the spoken cursor while muted so unmute does not replay a backlog.
    if (mute || !step.instruction) return;
    Speech.stop();
    Speech.speak(step.instruction, {
      rate: 1.0,
      language: speechLocale(languageRef.current),
    });
  }, [stepIndex, route, enabled, mute, languageRef]);

  // Mute must stop any in-progress utterance immediately
  useEffect(() => {
    if (!mute) return;
    Speech.stop();
  }, [mute]);

  // Soft route swap / initial seed when routeGeneration changes
  useEffect(() => {
    const activeRoute = routeRef.current;
    if (!activeRoute?.polyline[0]) return;

    const isFirst = seededGenerationRef.current === null;
    const midTrip =
      !isFirst && seededGenerationRef.current !== routeGeneration;

    offRouteStreakRef.current = 0;
    offRouteSinceRef.current = 0;
    // Do not clear reroutePendingRef here — an in-flight attempt owns that flag
    // until notifyRerouteSettled (avoids a window for duplicate fires).
    setOffRoute(false);
    setDistanceFromRouteM(0);
    lastRerouteAtRef.current = Date.now();
    cooldownMsRef.current = REROUTE_STARTUP_GRACE_MS;

    if (isFirst || !locationRef.current) {
      const start = activeRoute.polyline[0];
      const course = courseAlongRoute(start, activeRoute.polyline) ?? 0;
      lastHeadingRef.current = course;
      smoother.reset(start, course);
      const seeded: NavLocation = {
        latitude: start.latitude,
        longitude: start.longitude,
        heading: course,
        accuracy: 5,
        speed: 0,
      };
      locationRef.current = seeded;
      setLocation(seeded);
      stepIndexRef.current = 0;
      setStepIndex(0);
      lastSpokenStepRef.current = -1;
      simDistanceRef.current = 0;
    } else if (midTrip) {
      // Keep puck at last known location; re-snap step onto the new geometry.
      const pos = locationRef.current;
      const next = resolveCurrentStep(activeRoute.steps, pos, 0);
      stepIndexRef.current = next;
      setStepIndex(next);
      // Avoid replaying the current step instruction after soft swap.
      lastSpokenStepRef.current = next;
      const course =
        courseAlongRoute(pos, activeRoute.polyline) ?? lastHeadingRef.current;
      lastHeadingRef.current = course;
      smoother.reset(
        { latitude: pos.latitude, longitude: pos.longitude },
        course
      );
      // Keep simulation progress coherent with the new polyline.
      const along = distanceAlongRouteMeters(activeRoute.polyline, pos);
      if (Number.isFinite(along) && along >= 0) {
        simDistanceRef.current = along;
      }
    }

    seededGenerationRef.current = routeGeneration;
  }, [routeGeneration, smoother, routeRef]);

  const processPosition = (
    pos: NavLocation,
    activeRoute: OsrmRoute,
    tickTravelM = 0
  ) => {
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
    locationRef.current = resolved;
    setLocation(resolved);
    onLocationChangeRef.current?.(resolved);

    const prevStepIndex = stepIndexRef.current;
    const nextStep = resolveCurrentStep(
      activeRoute.steps,
      resolved,
      prevStepIndex
    );
    if (nextStep !== prevStepIndex) {
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

    const prevRem = lastProgressRemainingRef.current;
    const progressMoved =
      prevRem == null ||
      Math.abs(prevRem - rem.distanceRemaining) >= PROGRESS_UI_EPSILON_M;
    if (progressMoved || nextStep !== prevStepIndex) {
      lastProgressRemainingRef.current = rem.distanceRemaining;
      setProgress(progressPayload);
      setDistanceToNextManeuver(rem.distanceToNextManeuver);
    }
    onRouteProgressChangeRef.current?.(progressPayload);

    const streakNeeded = arriveStreakRequired(shouldSimulateRef.current);
    const wps = waypointsListRef.current;
    const dest = endPointRef.current;

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

    wps.forEach((wp, i) => {
      if (wp.separatesLegs === false) return;
      const key = `wp-${i}`;
      tryConfirmArrive(key, wp, {
        latitude: wp.latitude,
        longitude: wp.longitude,
        name: wp.name ?? String(i),
        index: i,
      });
    });

    const currentStep = activeRoute.steps[stepIndexRef.current];
    if (
      currentStep?.maneuver.type === 'arrive' &&
      currentStep.legIndex < (activeRoute.waypoints.length - 2 || 0)
    ) {
      const wp = wps[currentStep.legIndex];
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

    tryConfirmArrive('destination', dest, {
      latitude: dest.latitude,
      longitude: dest.longitude,
      name: dest.name ?? dest.title ?? 'Destination',
      index: wps.length,
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
        if (offRouteSinceRef.current === 0) {
          offRouteSinceRef.current = Date.now();
        }
        offRouteStreakRef.current += 1;
      } else {
        offRouteStreakRef.current = 0;
        offRouteSinceRef.current = 0;
        setOffRoute(false);
      }

      const confirmed = isOffRouteConfirmed({
        streak: offRouteStreakRef.current,
        offSinceMs: offRouteSinceRef.current,
      });
      setOffRoute(confirmed);

      const cooledDown =
        Date.now() - lastRerouteAtRef.current >= cooldownMsRef.current;
      if (confirmed && cooledDown && !reroutePendingRef.current) {
        offRouteStreakRef.current = 0;
        offRouteSinceRef.current = 0;
        reroutePendingRef.current = true;
        onOffRouteRef.current?.(rawForArrive);
      }
    } else if (shouldSimulateRef.current) {
      setOffRoute(false);
      setDistanceFromRouteM(0);
      offRouteStreakRef.current = 0;
      offRouteSinceRef.current = 0;
    }
  };

  // Simulation loop — keep interval across soft swaps via routeRef
  useEffect(() => {
    if (!enabled || !shouldSimulateRoute) return;
    if (!routeRef.current) return;

    const speed =
      speedForMode(travelMode) * Math.max(0.1, simulationSpeedMultiplier);
    const interval = setInterval(() => {
      const activeRoute = routeRef.current;
      if (!activeRoute) return;
      const totalLen =
        polylineLengthMeters(activeRoute.polyline) || activeRoute.distanceM;
      const tickTravelM = speed * (TICK_MS / 1000);
      simDistanceRef.current = Math.min(
        totalLen,
        simDistanceRef.current + tickTravelM
      );
      const { position, heading } = interpolateAlongPolyline(
        activeRoute.polyline,
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
        activeRoute,
        tickTravelM
      );
      if (simDistanceRef.current >= totalLen) {
        const dest = endPointRef.current;
        const endHeading = heading;
        smoother.reset(
          {
            latitude: dest.latitude,
            longitude: dest.longitude,
          },
          endHeading
        );
        processPosition(
          {
            latitude: dest.latitude,
            longitude: dest.longitude,
            heading: endHeading,
            accuracy: 5,
            speed: 0,
          },
          activeRoute,
          tickTravelM
        );
        clearInterval(interval);
      }
    }, TICK_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, shouldSimulateRoute, travelMode, simulationSpeedMultiplier]);

  // Live GPS — keep subscription across soft route swaps
  useEffect(() => {
    if (!enabled || shouldSimulateRoute) return;
    if (!routeRef.current) return;

    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { status } =
          await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
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

        if (cancelled) return;

        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: TICK_MS,
            distanceInterval: 1,
            ...(enableBackgroundLocation
              ? {
                  mayShowUserSettingsDialog: true,
                }
              : {}),
          },
          (loc: Location.LocationObject) => {
            if (cancelled) return;
            const activeRoute = routeRef.current;
            if (!activeRoute) return;
            const courseFallback =
              courseAlongRoute(
                {
                  latitude: loc.coords.latitude,
                  longitude: loc.coords.longitude,
                },
                activeRoute.polyline
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
              activeRoute
            );
          }
        );
        if (cancelled) {
          sub.remove();
          return;
        }
        subscription = sub;
      } catch (e) {
        if (cancelled) return;
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
  }, [enabled, shouldSimulateRoute, enableBackgroundLocation]);

  return {
    location,
    stepIndex,
    progress,
    distanceToNextManeuver,
    arrived,
    currentInstruction,
    offRoute,
    distanceFromRouteM,
    notifyRerouteSettled,
  };
}
