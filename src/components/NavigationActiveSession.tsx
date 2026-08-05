import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import * as Speech from 'expo-speech';
import { LocateFixed, X } from 'lucide-react-native';

import type {
  BottomSheetProps,
  Location as NavLocation,
  MapMarkerImage,
  MarkerStyle,
  RoutePoint,
  Waypoint,
  WaypointEvent,
  RouteProgress,
} from '../types';
import type { Language } from '../locals';
import { speechLocale } from '../locals';
import type { OsrmRoute } from '../osrm/client';
import { t } from '../i18n/strings';
import { useNavigationSession } from '../hooks/useNavigationSession';
import { useLatestRef } from '../hooks/useLatestRef';
import {
  NavigationMap,
  type NavigationMapHandle,
} from './NavigationMap';
import { ManeuverBanner } from './ManeuverBanner';
import { MapHud } from './MapHud';
import { EndOfRouteFeedback } from './EndOfRouteFeedback';
import { FollowBreakSurface } from './FollowBreakSurface';
import { NavIcon } from './NavIcon';
import { zoomForSpanMeters, distanceMeters } from '../osrm/progress';
import { FOLLOW_ZOOM } from '../geo/navigationCamera';
import type { LatLng } from '../osrm/instructions';
import { navChrome } from '../theme/navChrome';
import { elevatedShadow } from '../theme/shadows';

function stepMidpoint(
  steps: { coordinates: LatLng }[],
  index: number
): LatLng | undefined {
  const a = steps[index]?.coordinates;
  if (!a) return undefined;
  const b = steps[index + 1]?.coordinates ?? a;
  return {
    latitude: (a.latitude + b.latitude) / 2,
    longitude: (a.longitude + b.longitude) / 2,
  };
}

export type NavigationActiveSessionProps = {
  style?: StyleProp<ViewStyle>;
  route: OsrmRoute;
  routeGeneration: number;
  alternatives: OsrmRoute[];
  startPoint: RoutePoint;
  endPoint: RoutePoint;
  waypoints?: Waypoint[];
  travelMode?: 'driving' | 'driving-traffic' | 'walking' | 'cycling';
  language: Language;
  distanceUnit: 'metric' | 'imperial';
  mute: boolean;
  setMute: (updater: (m: boolean) => boolean) => void;
  simulationSpeedMultiplier: number;
  /** Bundled feature toggles (keeps the public prop surface flat). */
  features: {
    simulateRoute: boolean;
    statusHidden: boolean;
    cancelButton: boolean;
    endFeedback: boolean;
    autoReroute: boolean;
    backgroundLocation: boolean;
  };
  rerouting: boolean;
  userMarker?: MarkerStyle;
  defaultStartIcon?: MapMarkerImage;
  defaultEndIcon?: MapMarkerImage;
  defaultViaIcon?: MapMarkerImage;
  topInset: number;
  bottomInset: number;
  /**
   * Override HUD / chrome clearance above the bottom sheet.
   * When omitted, derived from sheet visibility + safe-area inset.
   */
  bottomOffset?: number;
  BottomSheet: ComponentType<BottomSheetProps>;
  cycleRoute: () => void;
  rerouteFrom: (
    origin: { latitude: number; longitude: number },
    options?: { currentLegIndex?: number }
  ) => Promise<boolean | 'aborted'>;
  onLocationChange?: (location: NavLocation) => void;
  onRouteProgressChange?: (progress: RouteProgress) => void;
  onArrive?: (point: WaypointEvent) => void;
  onError?: (message: string) => void;
  onOffRoute?: (location: NavLocation) => void;
  onReroute?: (info: { location: NavLocation }) => void;
  onRerouteFailed?: (info: { message: string }) => void;
  onCancel: () => void;
  onPressMenu?: () => void;
};

/**
 * Active turn-by-turn session. Soft-swaps when `routeGeneration` changes
 * (reroute / alt cycle) without remounting the map or GPS watch.
 */
export function NavigationActiveSession({
  style,
  route,
  routeGeneration,
  alternatives,
  startPoint,
  endPoint,
  waypoints,
  travelMode = 'driving',
  language,
  distanceUnit,
  mute,
  setMute,
  simulationSpeedMultiplier,
  features,
  rerouting,
  userMarker,
  defaultStartIcon,
  defaultEndIcon,
  defaultViaIcon,
  topInset,
  bottomInset,
  bottomOffset: bottomOffsetProp,
  BottomSheet,
  cycleRoute,
  rerouteFrom,
  onLocationChange,
  onRouteProgressChange,
  onArrive,
  onError,
  onOffRoute,
  onReroute,
  onRerouteFailed,
  onCancel,
  onPressMenu,
}: NavigationActiveSessionProps) {
  const [followUser, setFollowUser] = useState(true);
  const [feedbackDismissed, setFeedbackDismissed] = useState(false);
  const mapRef = useRef<NavigationMapHandle>(null);
  const muteRef = useLatestRef(mute);
  const stepIndexRef = useRef(0);
  const locationRef = useRef<NavLocation | null>(null);
  const routeStepsRef = useLatestRef(route.steps);

  const onOffRouteRef = useLatestRef(onOffRoute);
  const onRerouteRef = useLatestRef(onReroute);
  const onRerouteFailedRef = useLatestRef(onRerouteFailed);
  const rerouteFromRef = useLatestRef(rerouteFrom);
  const languageRef = useLatestRef(language);
  const notifyRerouteSettledRef = useRef<(ok: boolean) => void>(() => {});

  const handleOffRoute = useCallback(
    (loc: NavLocation) => {
      onOffRouteRef.current?.(loc);
      const legIndex =
        routeStepsRef.current[stepIndexRef.current]?.legIndex ?? 0;
      void rerouteFromRef.current(loc, { currentLegIndex: legIndex }).then(
        (result) => {
          // Aborted attempts must not settle cooldown — a newer attempt owns it.
          if (result === 'aborted') return;
          notifyRerouteSettledRef.current(result);
          if (result) {
            if (!muteRef.current) {
              Speech.stop();
              Speech.speak(t('recalculating', languageRef.current), {
                rate: 1.0,
                language: speechLocale(languageRef.current),
              });
            }
            onRerouteRef.current?.({ location: loc });
          } else {
            onRerouteFailedRef.current?.({
              message: 'Unable to recalculate route.',
            });
          }
        }
      );
    },
    [
      onOffRouteRef,
      onRerouteRef,
      onRerouteFailedRef,
      rerouteFromRef,
      languageRef,
      routeStepsRef,
      muteRef,
    ]
  );

  const session = useNavigationSession({
    route,
    routeGeneration,
    waypoints,
    endPoint,
    shouldSimulateRoute: features.simulateRoute,
    simulationSpeedMultiplier,
    mute,
    language,
    travelMode,
    enabled: true,
    rerouteEnabled: features.autoReroute && !features.simulateRoute,
    enableBackgroundLocation: features.backgroundLocation,
    onLocationChange,
    onRouteProgressChange,
    onArrive,
    onError,
    onOffRoute: handleOffRoute,
  });

  useEffect(() => {
    notifyRerouteSettledRef.current = session.notifyRerouteSettled;
  }, [session.notifyRerouteSettled]);

  useEffect(() => {
    stepIndexRef.current = session.stepIndex;
  }, [session.stepIndex]);

  useEffect(() => {
    locationRef.current = session.location;
  }, [session.location]);

  const initialZoom = useMemo(
    () =>
      zoomForSpanMeters(
        Math.max(
          200,
          distanceMeters(startPoint, endPoint) || route.distanceM
        )
      ),
    [startPoint, endPoint, route.distanceM]
  );

  const handleBreakFollow = useCallback(() => {
    setFollowUser(false);
  }, []);

  const handleToggleMute = useCallback(() => {
    setMute((m) => {
      const next = !m;
      // Stop current utterance immediately when muting (don't wait for effects).
      if (next) {
        Speech.stop();
      }
      return next;
    });
  }, [setMute]);

  const handleCompass = useCallback(() => {
    setFollowUser(true);
    const loc = locationRef.current;
    if (loc) {
      mapRef.current?.setCameraPosition({
        coordinates: loc,
        zoom: FOLLOW_ZOOM,
        bearing: 0,
      });
    }
  }, []);

  const handleRecenter = useCallback(() => {
    setFollowUser(true);
    const loc = locationRef.current;
    if (loc) {
      mapRef.current?.setCameraPosition({
        coordinates: loc,
        zoom: FOLLOW_ZOOM,
        bearing: loc.heading,
      });
    }
  }, []);

  const step = route.steps[session.stepIndex];
  const showFeedback =
    features.endFeedback && session.arrived && !feedbackDismissed;
  const progress =
    session.progress ??
    ({
      distanceTraveled: 0,
      durationRemaining: route.durationS,
      fractionTraveled: 0,
      distanceRemaining: route.distanceM,
    } satisfies RouteProgress);

  const bannerHeight = topInset + 72;
  const sheetHeight =
    bottomOffsetProp ??
    (features.statusHidden ? 24 : Math.max(120, bottomInset + 100));
  const altPolylines = useMemo(
    () => alternatives.map((a) => a.polyline),
    [alternatives]
  );

  const currentStepPoint = useMemo(
    () => stepMidpoint(route.steps, session.stepIndex),
    [route.steps, session.stepIndex]
  );
  const cameraLookAheadPoint = useMemo(
    () =>
      route.steps[session.stepIndex + 1]?.coordinates ??
      stepMidpoint(route.steps, session.stepIndex),
    [route.steps, session.stepIndex]
  );

  return (
    <View style={[styles.root, style]} testID="navigation-view">
      <NavigationMap
        ref={mapRef}
        polyline={route.polyline}
        alternativePolylines={altPolylines}
        location={session.location}
        startPoint={startPoint}
        endPoint={endPoint}
        waypoints={waypoints}
        userMarker={userMarker}
        defaultStartIcon={defaultStartIcon}
        defaultEndIcon={defaultEndIcon}
        defaultViaIcon={defaultViaIcon}
        currentStepName={step?.name}
        currentStepPoint={currentStepPoint}
        cameraLookAheadPoint={cameraLookAheadPoint}
        followUser={followUser}
        zoom={followUser ? FOLLOW_ZOOM : initialZoom}
        onCameraMoveByUser={handleBreakFollow}
      />

      {followUser ? (
        <FollowBreakSurface
          top={bannerHeight}
          bottom={sheetHeight}
          onBreakFollow={handleBreakFollow}
        />
      ) : null}

      {step ? (
        <ManeuverBanner
          instruction={session.currentInstruction || step.instruction}
          streetName={step.name}
          distanceToNextManeuver={
            session.distanceToNextManeuver || step.distance
          }
          maneuver={step.maneuver}
          distanceUnit={distanceUnit}
          topInset={topInset}
        />
      ) : null}

      {rerouting ? (
        <View
          style={[styles.reroutingChip, { top: bannerHeight + 8 }]}
          pointerEvents="none"
          testID="rerouting-status"
        >
          <Text style={styles.reroutingText}>
            {t('recalculating', language)}
          </Text>
        </View>
      ) : null}

      <MapHud
        mute={mute}
        language={language}
        distanceUnit={distanceUnit}
        speedMps={session.location?.speed}
        currentStreet={step?.name}
        bottomOffset={sheetHeight}
        onCompassPress={handleCompass}
        onToggleMute={handleToggleMute}
        onPressMenu={onPressMenu}
      />

      {!followUser ? (
        <Pressable
          testID="recenter-button"
          accessibilityRole="button"
          accessibilityLabel={t('recenter', language)}
          onPress={handleRecenter}
          style={({ pressed }) => [
            styles.recenterFab,
            {
              bottom:
                sheetHeight +
                8 +
                (navChrome.space.fab + navChrome.space.gap) * 2,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          <NavIcon icon={LocateFixed} />
        </Pressable>
      ) : null}

      {!features.statusHidden ? (
        <BottomSheet
          durationRemaining={progress.durationRemaining}
          distanceRemaining={progress.distanceRemaining}
          distanceUnit={distanceUnit}
          language={language}
          showCancelButton={features.cancelButton}
          showAltRoutesButton={alternatives.length > 0}
          bottomInset={bottomInset}
          onCancel={onCancel}
          onCycleRoutes={cycleRoute}
        />
      ) : null}

      {features.statusHidden && features.cancelButton ? (
        <Pressable
          testID="cancel-navigation"
          accessibilityRole="button"
          accessibilityLabel={t('cancel', language)}
          onPress={onCancel}
          style={styles.floatingCancel}
        >
          <NavIcon
            icon={X}
            color={navChrome.colors.cancel}
            strokeWidth={2.5}
          />
        </Pressable>
      ) : null}

      {showFeedback ? (
        <EndOfRouteFeedback
          language={language}
          destinationTitle={endPoint.name ?? endPoint.title}
          onDone={() => {
            setFeedbackDismissed(true);
            onCancel();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  reroutingChip: {
    position: 'absolute',
    alignSelf: 'center',
    left: 72,
    right: 72,
    backgroundColor: navChrome.colors.bannerBg,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    zIndex: 14,
  },
  reroutingText: {
    color: navChrome.colors.bannerFg,
    fontSize: 13,
    fontWeight: '600',
  },
  recenterFab: {
    position: 'absolute',
    right: navChrome.space.edge,
    width: navChrome.space.fab,
    height: navChrome.space.fab,
    borderRadius: navChrome.radius.fab,
    backgroundColor: navChrome.colors.fabBg,
    borderWidth: 2,
    borderColor: navChrome.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevatedShadow(2, 6, 0.2, 5),
    zIndex: 12,
  },
  floatingCancel: {
    position: 'absolute',
    top: 52,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...elevatedShadow(2, 6, 0.2, 4),
  },
});
