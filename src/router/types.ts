import type { Language } from '../locals';
import type { LatLng, OsrmProfile, OsrmRoute } from '../osrm/instructions';

/**
 * Portable routing request used by {@link RouterAdapter}.
 * Hosts can swap OSRM for Mapbox / Google / custom engines behind the same shape.
 */
export type RouterRequest = {
  coordinates: LatLng[];
  profile: OsrmProfile;
  language: Language;
  alternatives?: boolean;
  signal?: AbortSignal;
};

/**
 * Pluggable routing backend. Default implementation talks to OSRM HTTP API.
 * Traffic-aware routers should map `driving` / host-specific profiles here.
 */
export type RouterAdapter = {
  fetchRoutes(request: RouterRequest): Promise<OsrmRoute[]>;
};
