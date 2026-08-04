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
  selectRoute: (index: number) => void;
  cycleRoute: () => void;
  /** Re-fetch from a live origin through remaining waypoints to endPoint. */
  rerouteFrom: (
    origin: Coordinate,
    options?: RerouteFromOptions
  ) => Promise<boolean>;
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
  const [loading, setLoading] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const onErrorRef = useLatestRef(onError);

  const router = useMemo(
    () => routerProp ?? createOsrmRouterAdapter(osrmBaseUrl),
    [routerProp, osrmBaseUrl]
  );

  const waypointsKey = useMemo(
    () =>
      JSON.stringify(
        waypoints.map((w) => [w.latitude, w.longitude, w.name, w.separatesLegs])
      ),
    [waypoints]
  );

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
      ...waypoints.map((w) => ({
        latitude: w.latitude,
        longitude: w.longitude,
      })),
      {
        latitude: endPoint.latitude,
        longitude: endPoint.longitude,
      },
    ];

    const profile = travelModeToProfile(travelMode);

    router
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
  }, [
    enabled,
    startPoint.latitude,
    startPoint.longitude,
    endPoint.latitude,
    endPoint.longitude,
    travelMode,
    language,
    router,
    tick,
    waypointsKey,
    waypoints,
    onErrorRef,
  ]);

  const selectRoute = useCallback((index: number) => {
    setSelectedRouteIndex((prev) => {
      if (index < 0 || index >= routes.length) return prev;
      return index;
    });
  }, [routes.length]);

  const cycleRoute = useCallback(() => {
    setSelectedRouteIndex((prev) => {
      if (routes.length < 2) return 0;
      return (prev + 1) % routes.length;
    });
  }, [routes.length]);

  const rerouteFrom = useCallback(
    async (
      origin: Coordinate,
      options?: RerouteFromOptions
    ): Promise<boolean> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setRerouting(true);

      const legIndex = options?.currentLegIndex ?? 0;
      const remainingWaypoints: Coordinate[] = [];
      for (let i = 0; i < waypoints.length; i++) {
        const w = waypoints[i]!;
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
        const result = await router.fetchRoutes({
          coordinates: coords,
          profile,
          language,
          alternatives: true,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return false;
        if (!result.length) {
          const message = 'Unable to recalculate route.';
          onErrorRef.current?.(message);
          return false;
        }
        setRoutes(result);
        setSelectedRouteIndex(0);
        setError(null);
        return true;
      } catch (e: unknown) {
        if (controller.signal.aborted) return false;
        const message = formatOsrmError(e);
        onErrorRef.current?.(message);
        return false;
      } finally {
        if (!controller.signal.aborted) setRerouting(false);
      }
    },
    [waypoints, endPoint, travelMode, language, router, onErrorRef]
  );

  const route = routes[selectedRouteIndex] ?? routes[0] ?? null;
  const alternatives = routes.filter((_, i) => i !== selectedRouteIndex);

  return {
    route,
    alternatives,
    selectedRouteIndex,
    selectRoute,
    cycleRoute,
    rerouteFrom,
    loading,
    rerouting,
    error,
    refetch: () => setTick((t) => t + 1),
  };
}
