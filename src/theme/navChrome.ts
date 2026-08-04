/**
 * Shared chrome tokens for turn-by-turn overlays (Waze / Maps–familiar).
 */
export const navChrome = {
  colors: {
    bannerBg: '#0B1220',
    bannerFg: '#FFFFFF',
    bannerFgMuted: 'rgba(255,255,255,0.78)',
    streetCyan: '#33B5E5',
    accent: '#33B5E5',
    accentDeep: '#1A9BC4',
    /** Mapbox-like FAB icon blue */
    fabIcon: '#1A73E8',
    puckBlue: '#0B4F9C',
    sheetBg: '#FFFFFF',
    sheetFg: '#0F172A',
    sheetMuted: '#64748B',
    sheetBorder: '#E2E8F0',
    cancel: '#EF4444',
    cancelSoft: '#FEE2E2',
    muteBg: '#F1F5F9',
    fabBg: '#FFFFFF',
    speedBg: '#3A3A3C',
    speedFg: '#FFFFFF',
    shadow: '#000000',
    overlay: 'rgba(11,18,32,0.45)',
    success: '#10B981',
    routeAlt: 'rgba(123,97,255,0.45)',
  },
  space: {
    edge: 12,
    bannerPadV: 10,
    bannerPadH: 14,
    bottomPadV: 12,
    bottomPadH: 14,
    iconWell: 44,
    fab: 48,
    gap: 10,
  },
  type: {
    distance: 32,
    instruction: 15,
    metric: 18,
    eta: 28,
    caption: 11,
  },
  radius: {
    banner: 0,
    sheet: 20,
    fab: 24,
    iconBtn: 22,
    chip: 16,
  },
  route: {
    width: 10,
    altWidth: 7,
    color: '#7B61FF',
    altColor: 'rgba(123,97,255,0.4)',
  },
} as const;

/** Light muted Google Maps JSON style (Android best-effort). */
export const GOOGLE_MUTED_MAP_STYLE = JSON.stringify([
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#ffffff' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry',
    stylers: [{ color: '#eeeeee' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#dadada' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#c9e7f5' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#e8f0e5' }],
  },
]);
