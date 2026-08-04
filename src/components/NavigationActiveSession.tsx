import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
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
  BottomSheet: ComponentType<BottomSheetProps>;
  cycleRoute: () => void;
  rerouteFrom: (
    origin: { latitude: number; longitude: number },
    options?: { currentLegIndex?: number }
  ) => Promise<boolean>;
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
 * Mounted with a `key` derived from the active route so session state resets
 * cleanly on reroute without render-phase ref/state adjustment effects.
 */
export function NavigationActiveSession({
  style,
  route,
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

  const onOffRouteRef = useLatestRef(onOffRoute);
  const onRerouteRef = useLatestRef(onReroute);
  const onRerouteFailedRef = useLatestRef(onRerouteFailed);
  const rerouteFromRef = useLatestRef(rerouteFrom);
  const languageRef = useLatestRef(language);

  const handleOffRoute = useCallback((loc: NavLocation) => {
    onOffRouteRef.current?.(loc);
    if (!muteRef.current) {
      Speech.stop();
      Speech.speak(t('recalculating', languageRef.current), { rate: 1.0 });
    }
    const legIndex = route.steps[stepIndexRef.current]?.legIndex ?? 0;
    void rerouteFromRef.current(loc, { currentLegIndex: legIndex }).then((ok) => {
      if (ok) {
        onRerouteRef.current?.({ location: loc });
      } else {
        onRerouteFailedRef.current?.({
          message: 'Unable to recalculate route.',
        });
      }
    });
  }, [route.steps, muteRef, onOffRouteRef, onRerouteRef, onRerouteFailedRef, rerouteFromRef, languageRef]);

  const session = useNavigationSession({
    route,
    waypoints,
    endPoint,
    shouldSimulateRoute: features.simulateRoute,
    simulationSpeedMultiplier,
    mute,
    travelMode,
    enabled: true,
    rerouteEnabled: features.autoReroute && !features.simulateRoute,
    rerouteInFlight: rerouting,
    enableBackgroundLocation: features.backgroundLocation,
    onLocationChange,
    onRouteProgressChange,
    onArrive,
    onError,
    onOffRoute: handleOffRoute,
  });

  useEffect(() => {
    stepIndexRef.current = session.stepIndex;
  }, [session.stepIndex]);

  const initialZoom = zoomForSpanMeters(
    Math.max(200, distanceMeters(startPoint, endPoint) || route.distanceM)
  );

  const handleCompass = useCallback(() => {
    setFollowUser(true);
    if (session.location) {
      mapRef.current?.setCameraPosition({
        coordinates: session.location,
        zoom: 16,
        bearing: 0,
      });
    }
  }, [session.location]);

  const handleRecenter = useCallback(() => {
    setFollowUser(true);
    if (session.location) {
      mapRef.current?.setCameraPosition({
        coordinates: session.location,
        zoom: 16,
        bearing: session.location.heading,
      });
    }
  }, [session.location]);

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
  const sheetHeight = features.statusHidden
    ? 24
    : Math.max(120, bottomInset + 100);
  const altPolylines = alternatives.map((a) => a.polyline);

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
        currentStepPoint={stepMidpoint(route.steps, session.stepIndex)}
        cameraLookAheadPoint={
          route.steps[session.stepIndex + 1]?.coordinates ??
          stepMidpoint(route.steps, session.stepIndex)
        }
        followUser={followUser}
        zoom={followUser ? 16 : initialZoom}
        onCameraMoveByUser={() => setFollowUser(false)}
      />

      {followUser ? (
        <FollowBreakSurface
          top={bannerHeight}
          bottom={sheetHeight}
          onBreakFollow={() => setFollowUser(false)}
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
        onToggleMute={() => setMute((m) => !m)}
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
