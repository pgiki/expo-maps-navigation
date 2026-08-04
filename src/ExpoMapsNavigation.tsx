import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StatusBar } from 'react-native';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useImage } from 'expo-image';

import type { MapNavigationProps, MarkerStyle } from './types';
import { t } from './i18n/strings';
import { useOsrmRoute } from './hooks/useOsrmRoute';
import { NavigationGateView } from './components/NavigationGateView';
import { NavigationActiveSession } from './components/NavigationActiveSession';
import { TripProgressBar } from './components/TripProgressBar';
import { DEFAULT_OSRM_BASE_URL } from './osrm/client';
import navigationPuck from './assets/navigation-puck.png';
import markerStart from './assets/marker-start.png';
import markerEnd from './assets/marker-end.png';
import markerVia from './assets/marker-via.png';

const safeAreaModule: {
  useSafeAreaInsets?: () => {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
} | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-safe-area-context') as {
      useSafeAreaInsets: () => {
        top: number;
        bottom: number;
        left: number;
        right: number;
      };
    };
  } catch {
    return null;
  }
})();

function useNavInsets() {
  let sa = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    sa = safeAreaModule?.useSafeAreaInsets?.() ?? sa;
  } catch {
    // optional peer / no provider
  }
  const top =
    sa.top > 0
      ? sa.top
      : Platform.OS === 'ios'
        ? 54
        : (StatusBar.currentHeight ?? 24);
  const bottom =
    sa.bottom > 0 ? sa.bottom : Platform.OS === 'ios' ? 28 : 16;
  return { top, bottom };
}

function isPublicDemoOsrm(url: string | undefined): boolean {
  const base = (url?.trim() || DEFAULT_OSRM_BASE_URL).replace(/\/$/, '');
  return base === DEFAULT_OSRM_BASE_URL;
}

function routeIdentity(route: {
  distanceM: number;
  durationS: number;
  polyline: { latitude: number; longitude: number }[];
}): string {
  const first = route.polyline[0];
  const last = route.polyline[route.polyline.length - 1];
  return [
    route.distanceM,
    route.durationS,
    route.polyline.length,
    first?.latitude,
    first?.longitude,
    last?.latitude,
    last?.longitude,
  ].join(':');
}

export default function ExpoMapsNavigation(props: MapNavigationProps) {
  const {
    style,
    startPoint,
    endPoint,
    waypoints,
    travelMode = 'driving',
    language = 'en',
    distanceUnit = 'imperial',
    mute: muteProp = false,
    showCancelButton = false,
    shouldSimulateRoute = false,
    simulationSpeedMultiplier = 1,
    showsEndOfRouteFeedback = false,
    hideStatusView = false,
    rerouteEnabled = true,
    userMarker,
    osrmBaseUrl,
    requireOsrmBaseUrl = false,
    router,
    enableBackgroundLocation = false,
    onLocationChange,
    onRouteProgressChange,
    onError,
    onCancelNavigation,
    onArrive,
    onOffRoute,
    onReroute,
    onRerouteFailed,
    onPressMenu,
    BottomSheet = TripProgressBar,
  } = props;

  const insets = useNavInsets();
  const [prepared, setPrepared] = useState(false);
  const [permError, setPermError] = useState<string | undefined>();
  const [permTick, setPermTick] = useState(0);
  const [sessionActive, setSessionActive] = useState(true);
  const [muteUser, setMuteUser] = useState<boolean | null>(null);
  const mute = muteUser ?? muteProp;
  const setMute = useCallback(
    (updater: (m: boolean) => boolean) => {
      setMuteUser((prev) => updater(prev ?? muteProp));
    },
    [muteProp]
  );

  const defaultPuck = useImage(navigationPuck, {
    maxWidth: 96,
    maxHeight: 96,
  });
  const defaultStartPin = useImage(markerStart, {
    maxWidth: 64,
    maxHeight: 64,
  });
  const defaultEndPin = useImage(markerEnd, {
    maxWidth: 64,
    maxHeight: 64,
  });
  const defaultViaPin = useImage(markerVia, {
    maxWidth: 64,
    maxHeight: 64,
  });

  const resolvedUserMarker = useMemo((): MarkerStyle | undefined => {
    if (userMarker) return userMarker;
    if (defaultPuck) return { icon: defaultPuck };
    return undefined;
  }, [userMarker, defaultPuck]);

  useEffect(() => {
    if (!sessionActive) return;
    let deactivate: (() => void) | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const KeepAwake = require('expo-keep-awake') as {
        activateKeepAwakeAsync?: (tag: string) => Promise<void>;
        deactivateKeepAwake?: (tag: string) => void;
      };
      const tag = 'expo-maps-navigation';
      KeepAwake.activateKeepAwakeAsync?.(tag)?.catch(() => undefined);
      deactivate = () => KeepAwake.deactivateKeepAwake?.(tag);
    } catch {
      // optional peer
    }
    return () => deactivate?.();
  }, [sessionActive]);

  useEffect(() => {
    if (
      requireOsrmBaseUrl &&
      !router &&
      isPublicDemoOsrm(osrmBaseUrl)
    ) {
      const message =
        'osrmBaseUrl is required for production (public OSRM demo has no SLA). Pass osrmBaseUrl or a custom router.';
      setPermError(message);
      onError?.({ message });
      setPrepared(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        if (shouldSimulateRoute) {
          if (!cancelled) {
            setPermError(undefined);
            setPrepared(true);
          }
          return;
        }
        const { status } =
          await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          const message = t('permissionDenied', language);
          setPermError(message);
          setPrepared(false);
          onError?.({ message });
        } else {
          setPermError(undefined);
          setPrepared(true);
        }
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Permission request failed.';
        if (!cancelled) {
          setPermError(message);
          setPrepared(false);
          onError?.({ message });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    shouldSimulateRoute,
    permTick,
    requireOsrmBaseUrl,
    osrmBaseUrl,
    router,
    language,
  ]);

  const hooksEnabled = prepared && sessionActive;

  const {
    route,
    alternatives,
    cycleRoute,
    rerouteFrom,
    loading,
    rerouting,
    error,
  } = useOsrmRoute({
    startPoint,
    endPoint,
    waypoints,
    travelMode,
    language,
    osrmBaseUrl,
    router,
    enabled: hooksEnabled,
    onError: (message) => onError?.({ message }),
  });

  const handleCancel = useCallback(() => {
    Speech.stop();
    setSessionActive(false);
    onCancelNavigation?.({ message: 'Navigation cancelled' });
  }, [onCancelNavigation]);

  const handlePermissionRetry = useCallback(() => {
    setPermError(undefined);
    setPermTick((n) => n + 1);
  }, []);

  if (!prepared) {
    return (
      <NavigationGateView
        style={style}
        language={language}
        message={permError ?? t('loading', language)}
        testID="nav-loading"
        messageStyle={permError ? { color: 'red' } : undefined}
        onRetry={permError ? handlePermissionRetry : undefined}
      />
    );
  }

  if (!sessionActive) {
    return (
      <NavigationGateView
        style={style}
        language={language}
        message={t('cancel', language)}
        testID="nav-cancelled"
      />
    );
  }

  if (loading && !route) {
    return (
      <NavigationGateView
        style={style}
        language={language}
        message={t('loading', language)}
        testID="nav-loading"
      />
    );
  }

  if (error && !route) {
    return (
      <NavigationGateView
        style={style}
        language={language}
        message={error}
        testID="nav-error"
        messageStyle={{ color: 'red' }}
      />
    );
  }

  if (!route) {
    return (
      <NavigationGateView
        style={style}
        language={language}
        message={t('loading', language)}
        testID="nav-loading"
      />
    );
  }

  return (
    <NavigationActiveSession
      key={routeIdentity(route)}
      style={style}
      route={route}
      alternatives={alternatives}
      startPoint={startPoint}
      endPoint={endPoint}
      waypoints={waypoints}
      travelMode={travelMode}
      language={language}
      distanceUnit={distanceUnit}
      mute={mute}
      setMute={setMute}
      simulationSpeedMultiplier={simulationSpeedMultiplier}
      features={{
        simulateRoute: shouldSimulateRoute,
        statusHidden: hideStatusView,
        cancelButton: showCancelButton,
        endFeedback: showsEndOfRouteFeedback,
        autoReroute: rerouteEnabled,
        backgroundLocation: enableBackgroundLocation,
      }}
      rerouting={rerouting}
      userMarker={resolvedUserMarker}
      defaultStartIcon={defaultStartPin ?? undefined}
      defaultEndIcon={defaultEndPin ?? undefined}
      defaultViaIcon={defaultViaPin ?? undefined}
      topInset={insets.top}
      bottomInset={insets.bottom}
      BottomSheet={BottomSheet}
      cycleRoute={cycleRoute}
      rerouteFrom={rerouteFrom}
      onLocationChange={onLocationChange}
      onRouteProgressChange={onRouteProgressChange}
      onArrive={onArrive}
      onError={(message) => onError?.({ message })}
      onOffRoute={onOffRoute}
      onReroute={onReroute}
      onRerouteFailed={onRerouteFailed}
      onCancel={handleCancel}
      onPressMenu={onPressMenu}
    />
  );
}
