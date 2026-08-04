import { t } from '../i18n/strings';
import type { Language } from '../locals';

export type LatLng = { latitude: number; longitude: number };

export type OsrmManeuver = {
  type: string;
  modifier?: string;
  bearing_before?: number;
  bearing_after?: number;
  location?: [number, number];
};

export type OsrmStep = {
  name: string;
  distance: number;
  duration: number;
  maneuver: OsrmManeuver;
  coordinates: LatLng;
  instruction: string;
  /** Leg index this step belongs to (for multi-waypoint routes). */
  legIndex: number;
};

export type OsrmRoute = {
  polyline: LatLng[];
  steps: OsrmStep[];
  distanceM: number;
  durationS: number;
  /** Waypoint coordinates including origin and destination (OSRM response order). */
  waypoints: LatLng[];
};

export type OsrmProfile = 'driving' | 'foot' | 'bike';

/**
 * Map travel mode → OSRM profile.
 *
 * Note: `driving-traffic` is an **alias of `driving`**. Public OSRM has no
 * live traffic; use a custom {@link RouterAdapter} for traffic-aware routing.
 */
export function travelModeToProfile(
  mode: 'driving' | 'driving-traffic' | 'walking' | 'cycling' = 'driving'
): OsrmProfile {
  switch (mode) {
    case 'walking':
      return 'foot';
    case 'cycling':
      return 'bike';
    case 'driving':
    case 'driving-traffic':
    default:
      return 'driving';
  }
}

function ontoRoad(name: string, language: Language): string {
  if (!name) return '';
  return t('ontoRoad', language).replace('{road}', name);
}

function onRoad(name: string, language: Language): string {
  if (!name) return '';
  return t('onRoad', language).replace('{road}', name);
}

function maneuverToText(
  step: { name: string; maneuver: OsrmManeuver },
  language: Language
): string {
  const { type, modifier } = step.maneuver;
  const road = ontoRoad(step.name, language);
  switch (type) {
    case 'depart':
      return (
        t('maneuverDepart', language).replace(
          '{modifier}',
          modifier ?? t('forward', language)
        ) + road
      );
    case 'arrive':
      return t('youHaveArrived', language);
    case 'turn': {
      if (!modifier) return t('maneuverTurn', language) + road;
      if (modifier === 'straight') {
        return t('maneuverContinueStraight', language) + road;
      }
      if (modifier.includes('slight')) {
        const side = modifier.replace('slight ', '');
        return (
          t('maneuverKeep', language).replace('{modifier}', side) + road
        );
      }
      return (
        t('maneuverTurnModifier', language).replace('{modifier}', modifier) +
        road
      );
    }
    case 'continue':
      return t('continue', language) + road;
    case 'merge':
      return (
        t('maneuverMerge', language).replace(
          '{modifier}',
          modifier ?? ''
        ) + road
      ).trim();
    case 'roundabout':
    case 'rotary':
      return t('maneuverEnterRoundabout', language) + road;
    case 'exit roundabout':
    case 'exit rotary':
      return t('maneuverExitRoundabout', language) + road;
    case 'fork':
      return (
        t('maneuverFork', language).replace(
          '{modifier}',
          modifier ?? t('straight', language)
        ) + road
      );
    case 'end of road':
      return (
        t('maneuverEndOfRoad', language).replace(
          '{modifier}',
          modifier ?? t('right', language)
        ) + road
      );
    case 'new name':
    case 'notification':
      return t('continue', language) + road;
    default:
      return step.name
        ? t('maneuverHeadTowards', language).replace('{road}', step.name)
        : t('continue', language);
  }
}

function bearingToCardinal(deg: number, language: Language = 'en'): string {
  const keys = [
    'cardinalNorth',
    'cardinalNortheast',
    'cardinalEast',
    'cardinalSoutheast',
    'cardinalSouth',
    'cardinalSouthwest',
    'cardinalWest',
    'cardinalNorthwest',
  ] as const;
  const key = keys[Math.round(deg / 45) % 8] ?? 'cardinalNorth';
  return t(key, language);
}

function fixDepartInstruction(
  step: OsrmStep,
  language: Language = 'en'
): OsrmStep {
  if (step.maneuver.type === 'depart' && step.maneuver.bearing_after != null) {
    const dir = bearingToCardinal(step.maneuver.bearing_after, language);
    return {
      ...step,
      instruction:
        t('maneuverHead', language).replace('{direction}', dir) +
        onRoad(step.name, language),
    };
  }
  return step;
}

export { maneuverToText, bearingToCardinal, fixDepartInstruction };
