import type { Language } from '../locals';
import { OsrmError } from './errors';
import {
  fixDepartInstruction,
  maneuverToText,
  type LatLng,
  type OsrmManeuver,
  type OsrmProfile,
  type OsrmRoute,
  type OsrmStep,
} from './instructions';

/**
 * OSRM routing client.
 * Endpoint: GET /route/v1/{profile}/{lon1},{lat1};{lon2},{lat2};...
 *           ?steps=true&geometries=geojson&overview=full
 *
 * ⚠️ The public demo server (`router.project-osrm.org`) has no SLA or rate
 * guarantees — use a self-hosted or commercial OSRM endpoint for production.
 */

export const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org';

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl?.trim() || DEFAULT_OSRM_BASE_URL).replace(/\/$/, '');
}

type OsrmJson = {
  code: string;
  message?: string;
  waypoints?: { location: [number, number]; name?: string }[];
  routes?: {
    distance: number;
    duration: number;
    geometry: { type: string; coordinates: [number, number][] };
    legs: {
      distance: number;
      duration: number;
      steps: {
        name: string;
        distance: number;
        duration: number;
        maneuver: OsrmManeuver;
        geometry: { coordinates: [number, number][] };
      }[];
    }[];
  }[];
};

function parseOsrmRoute(
  route: NonNullable<OsrmJson['routes']>[number],
  coordinates: LatLng[],
  waypointsJson: OsrmJson['waypoints'],
  language: Language
): OsrmRoute {
  const polyline: LatLng[] = route.geometry.coordinates.map(([lon, lat]) => ({
    latitude: lat,
    longitude: lon,
  }));

  const steps: OsrmStep[] = [];
  const legs = route.legs ?? [];
  legs.forEach((leg, legIndex) => {
    for (const s of leg.steps ?? []) {
      const stepLoc = s.geometry.coordinates[0] ?? s.maneuver.location;
      const raw: OsrmStep = {
        name: s.name,
        distance: s.distance,
        duration: s.duration,
        maneuver: s.maneuver,
        coordinates: stepLoc
          ? { latitude: stepLoc[1], longitude: stepLoc[0] }
          : coordinates[0]!,
        instruction: '',
        legIndex,
      };
      raw.instruction = maneuverToText(raw, language);
      steps.push(fixDepartInstruction(raw, language));
    }
  });

  const waypoints: LatLng[] = (waypointsJson ?? []).map((w) => ({
    latitude: w.location[1],
    longitude: w.location[0],
  }));

  return {
    polyline,
    steps,
    distanceM: route.distance,
    durationS: route.duration,
    waypoints: waypoints.length >= 2 ? waypoints : coordinates,
  };
}

/**
 * Fetch one or more OSRM routes (`alternatives=true` when requested).
 * @throws {OsrmError} on HTTP failure, non-Ok OSRM code, empty routes, or network error
 *   (AbortError is rethrown as-is when the signal aborts).
 */
export async function fetchOsrmRoutes(
  coordinates: LatLng[],
  signal?: AbortSignal,
  profile: OsrmProfile = 'driving',
  language: Language = 'en',
  alternatives = false,
  baseUrl: string = DEFAULT_OSRM_BASE_URL
): Promise<OsrmRoute[]> {
  if (coordinates.length < 2) {
    throw new OsrmError('At least two coordinates are required.', {
      code: 'InvalidInput',
    });
  }

  const coords = coordinates
    .map((c) => `${c.longitude},${c.latitude}`)
    .join(';');
  const base = normalizeBaseUrl(baseUrl);
  const url =
    `${base}/route/v1/${profile}/${coords}` +
    `?steps=true&geometries=geojson&overview=full&annotations=false` +
    (alternatives ? '&alternatives=true' : '');

  let resp: Response;
  try {
    resp = await fetch(url, { signal });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new OsrmError('Network request to OSRM failed.', {
      code: 'NetworkError',
      cause,
    });
  }

  if (!resp.ok) {
    throw new OsrmError(`OSRM HTTP ${resp.status}`, {
      status: resp.status,
      code: 'HttpError',
    });
  }

  let json: OsrmJson;
  try {
    json = (await resp.json()) as OsrmJson;
  } catch (cause) {
    throw new OsrmError('Failed to parse OSRM response.', {
      code: 'ParseError',
      cause,
    });
  }

  if (json.code !== 'Ok') {
    throw new OsrmError(json.message ?? `OSRM returned ${json.code}`, {
      code: json.code,
      status: resp.status,
    });
  }

  if (!json.routes?.length) {
    throw new OsrmError('OSRM returned no routes.', {
      code: 'NoRoute',
      status: resp.status,
    });
  }

  // Cap at primary + 1 alternative for map chrome.
  return json.routes
    .slice(0, alternatives ? 2 : 1)
    .map((r) => parseOsrmRoute(r, coordinates, json.waypoints, language));
}

export async function fetchOsrmRoute(
  coordinates: LatLng[],
  signal?: AbortSignal,
  profile: OsrmProfile = 'driving',
  language: Language = 'en',
  baseUrl: string = DEFAULT_OSRM_BASE_URL
): Promise<OsrmRoute | null> {
  const routes = await fetchOsrmRoutes(
    coordinates,
    signal,
    profile,
    language,
    false,
    baseUrl
  );
  return routes[0] ?? null;
}

/** Convenience: two-point driving route. */
export function fetchDrivingRoute(
  from: LatLng,
  to: LatLng,
  signal?: AbortSignal,
  language: Language = 'en',
  baseUrl: string = DEFAULT_OSRM_BASE_URL
): Promise<OsrmRoute | null> {
  return fetchOsrmRoute([from, to], signal, 'driving', language, baseUrl);
}

/** Walking directions. */
export function fetchWalkingRoute(
  from: LatLng,
  to: LatLng,
  signal?: AbortSignal,
  language: Language = 'en',
  baseUrl: string = DEFAULT_OSRM_BASE_URL
): Promise<OsrmRoute | null> {
  return fetchOsrmRoute([from, to], signal, 'foot', language, baseUrl);
}

export type { OsrmRoute, OsrmStep, OsrmProfile, LatLng };
export { OsrmError, isOsrmError, formatOsrmError } from './errors';
