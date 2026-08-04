import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Coordinate, Waypoint } from '../types';
import type { Language } from '../locals';
import { formatOsrmError } from '../osrm/errors';
import { DEFAULT_OSRM_BASE_URL } from '../osrm/client';
import type { OsrmRoute } from '../osrm/client';
import { travelModeToProfile } from '../osrm/instructions';
import { createOsrmRouterAdapter } from '../router/createOsrmRouterAdapter';
import type { RouterAdapter } from '../router/types';
import { useLatestRef } from './useLatestRef';

type TravelMode = 'driving' | 'driving-traffic' | 'walking' | 'cycling';

type UseOsrmRouteArgs = {
  startPoint: Coordinate;
  endPoint: Coordinate;
  waypoints?: Waypoint[];
  travelMode?: TravelMode;
  language?: Language;
  /** OSRM router base URL (ignored when `router` is set). */
  osrmBaseUrl?: string;
  /** Custom routing backend. */
  router?: RouterAdapter;
  enabled?: boolean;
  onError?: (message: string) => void;
};

type RerouteFromOptions = {
  /** Drop waypoints with index < this (already passed legs). */
  currentLegIndex?: number;
};

type UseOsrmRouteResult = {
  route: OsrmRoute | null;
  /** Additional OSRM routes for alternate-path chrome. */
  alternatives: OsrmRoute[];
  selectedRouteIndex: number;
  /** Increments on intentional route replace (fetch / reroute / cycle). */
  routeGeneration: number;
  selectRoute: (index: number) => void;
  cycleRoute: () => void;
  /** Re-fetch from a live origin through remaining waypoints to endPoint. */
  rerouteFrom: (
    origin: Coordinate,
    options?: RerouteFromOptions
  ) => Promise<boolean | 'aborted'>;
  loading: boolean;
  rerouting: boolean;
  error: string | null;
  refetch: () => void;
};

export function useOsrmRoute({
  startPoint,
  endPoint,
  waypoints = [],
  travelMode = 'driving',
  language = 'en',
  osrmBaseUrl = DEFAULT_OSRM_BASE_URL,
  router: routerProp,
  enabled = true,
  onError,
}: UseOsrmRouteArgs): UseOsrmRouteResult {
  const [routes, setRoutes] = useState<OsrmRoute[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routeGeneration, setRouteGeneration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const selectedRouteIndexRef = useRef(0);
  const onErrorRef = useLatestRef(onError);
  const waypointsRef = useLatestRef(waypoints);

  useEffect(() => {
    selectedRouteIndexRef.current = selectedRouteIndex;
  }, [selectedRouteIndex]);

  // Prefer host-provided router; otherwise rebuild only when base URL changes.
  const defaultRouter = useMemo(
    () => createOsrmRouterAdapter(osrmBaseUrl),
    [osrmBaseUrl]
  );
  const router = routerProp ?? defaultRouter;
  const routerRef = useLatestRef(router);

  const waypointsKey = useMemo(
    () =>
      JSON.stringify(
        waypoints.map((w) => [
          w.latitude,
          w.longitude,
          w.name,
          w.separatesLegs,
        ])
      ),
    [waypoints]
  );

  const bumpGeneration = useCallback(() => {
    setRouteGeneration((g) => g + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setSelectedRouteIndex(0);

    const coords: Coordinate[] = [
      {
        latitude: startPoint.latitude,
        longitude: startPoint.longitude,
      },
      ...waypointsRef.current.map((w) => ({
        latitude: w.latitude,
        longitude: w.longitude,
      })),
      {
        latitude: endPoint.latitude,
        longitude: endPoint.longitude,
      },
    ];

    const profile = travelModeToProfile(travelMode);

    routerRef.current
      .fetchRoutes({
        coordinates: coords,
        profile,
        language,
        alternatives: true,
        signal: controller.signal,
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.length) {
          const message = 'Unable to fetch route.';
          setError(message);
          setRoutes([]);
          onErrorRef.current?.(message);
        } else {
          setRoutes(result);
          bumpGeneration();
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        const message = formatOsrmError(e);
        setError(message);
        setRoutes([]);
        onErrorRef.current?.(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // waypointsKey captures content; avoid unstable waypoints/router array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    startPoint.latitude,
    startPoint.longitude,
    endPoint.latitude,
    endPoint.longitude,
    travelMode,
    language,
    osrmBaseUrl,
    routerProp,
    tick,
    waypointsKey,
    bumpGeneration,
  ]);

  const selectRoute = useCallback(
    (index: number) => {
      if (index < 0 || index >= routes.length) return;
      if (index === selectedRouteIndexRef.current) return;
      selectedRouteIndexRef.current = index;
      setSelectedRouteIndex(index);
      bumpGeneration();
    },
    [routes.length, bumpGeneration]
  );

  const cycleRoute = useCallback(() => {
    if (routes.length < 2) return;
    const next = (selectedRouteIndexRef.current + 1) % routes.length;
    if (next === selectedRouteIndexRef.current) return;
    selectedRouteIndexRef.current = next;
    setSelectedRouteIndex(next);
    bumpGeneration();
  }, [routes.length, bumpGeneration]);

  const rerouteFrom = useCallback(
    async (
      origin: Coordinate,
      options?: RerouteFromOptions
    ): Promise<boolean | 'aborted'> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setRerouting(true);

      const legIndex = options?.currentLegIndex ?? 0;
      const remainingWaypoints: Coordinate[] = [];
      const wps = waypointsRef.current;
      for (let i = 0; i < wps.length; i++) {
        const w = wps[i]!;
        if (i >= legIndex && w.separatesLegs !== false) {
          remainingWaypoints.push({
            latitude: w.latitude,
            longitude: w.longitude,
          });
        }
      }

      const coords: Coordinate[] = [
        { latitude: origin.latitude, longitude: origin.longitude },
        ...remainingWaypoints,
        { latitude: endPoint.latitude, longitude: endPoint.longitude },
      ];

      const profile = travelModeToProfile(travelMode);

      try {
        const result = await routerRef.current.fetchRoutes({
          coordinates: coords,
          profile,
          language,
          alternatives: true,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return 'aborted';
        if (!result.length) {
          const message = 'Unable to recalculate route.';
          onErrorRef.current?.(message);
          return false;
        }
        setRoutes(result);
        selectedRouteIndexRef.current = 0;
        setSelectedRouteIndex(0);
        bumpGeneration();
        setError(null);
        return true;
      } catch (e: unknown) {
        if (controller.signal.aborted) return 'aborted';
        const message = formatOsrmError(e);
        onErrorRef.current?.(message);
        return false;
      } finally {
        if (!controller.signal.aborted) setRerouting(false);
      }
    },
    [endPoint.latitude, endPoint.longitude, travelMode, language, bumpGeneration, waypointsRef, routerRef, onErrorRef]
  );

  const route = routes[selectedRouteIndex] ?? routes[0] ?? null;
  const alternatives = useMemo(
    () => routes.filter((_, i) => i !== selectedRouteIndex),
    [routes, selectedRouteIndex]
  );

  return {
    route,
    alternatives,
    selectedRouteIndex,
    routeGeneration,
    selectRoute,
    cycleRoute,
    rerouteFrom,
    loading,
    rerouting,
    error,
    refetch: () => setTick((t) => t + 1),
  };
}
