import {
  DEFAULT_OSRM_BASE_URL,
  fetchOsrmRoutes,
} from '../osrm/client';
import type { RouterAdapter } from './types';

/** Default adapter: OSRM HTTP `/route/v1/{profile}/...`. */
export function createOsrmRouterAdapter(
  baseUrl: string = DEFAULT_OSRM_BASE_URL
): RouterAdapter {
  return {
    async fetchRoutes(request) {
      return fetchOsrmRoutes(
        request.coordinates,
        request.signal,
        request.profile,
        request.language,
        Boolean(request.alternatives),
        baseUrl
      );
    },
  };
}
