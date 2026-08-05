import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type Ref,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { AppleMaps, GoogleMaps } from 'expo-maps';

import type {
  Coordinate,
  Location,
  MapMarkerImage,
  MarkerStyle,
  RoutePoint,
  Waypoint,
} from '../types';
import type { LatLng } from '../osrm/instructions';
import { distanceMeters } from '../osrm/progress';
import {
  bearingDeltaDeg,
  computeLookAheadBearing,
  FOLLOW_ZOOM,
  followAndroidDurationMs,
  programmaticMoveGuardMs,
  shouldUpdateFollowingCamera,
  type FollowingPlatform,
} from '../geo/navigationCamera';
import { useLatestRef } from '../hooks/useLatestRef';
import {
  GOOGLE_MUTED_MAP_STYLE,
  navChrome,
} from '../theme/navChrome';

export type NavigationMapHandle = {
  setCameraPosition: (config: {
    coordinates: Coordinate;
    zoom?: number;
    bearing?: number;
  }) => void;
};

type MapRef = {
  setCameraPosition?: (config: Record<string, unknown>) => void;
};

type Props = {
  polyline: LatLng[];
  /** Dimmed alternate route geometry (first alt; prefer `alternativePolylines`). */
  alternativePolyline?: LatLng[];
  /** All alternate route geometries (drawn dimmed under the primary). */
  alternativePolylines?: LatLng[][];
  location: Location | null;
  startPoint: RoutePoint;
  endPoint: RoutePoint;
  /** Street name annotation placed on the current step. */
  currentStepName?: string;
  currentStepPoint?: LatLng;
  /**
   * Upcoming geometry used to soften camera bearing toward the next maneuver
   * (Mapbox-style look-ahead, clamped ±45°).
   */
  cameraLookAheadPoint?: LatLng;
  waypoints?: Waypoint[];
  /** Optional override for the user location puck. */
  userMarker?: MarkerStyle;
  /** Default pin icons when start/end/via omit `icon` (Android especially). */
  defaultStartIcon?: MapMarkerImage;
  defaultEndIcon?: MapMarkerImage;
  defaultViaIcon?: MapMarkerImage;
  followUser?: boolean;
  zoom?: number;
  onCameraMoveByUser?: () => void;
};

type StreetLabel = {
  id: string;
  coordinates: { latitude: number; longitude: number };
  title: string;
};

const EMPTY_WAYPOINTS: Waypoint[] = [];

type PolylineStyle = {
  id: string;
  coordinates: { latitude: number; longitude: number }[];
  color: string;
  width: number;
};

function resolveIcon(style?: MarkerStyle): MapMarkerImage | undefined {
  return style?.icon ?? style?.image;
}

function pointLabel(
  point: { name?: string; title?: string },
  fallback: string
): string {
  const label = point.name?.trim() || point.title?.trim();
  return label || fallback;
}

function buildStreetLabel(
  currentStepName?: string,
  currentStepPoint?: LatLng
): StreetLabel | null {
  if (!currentStepName?.trim() || !currentStepPoint) return null;
  return {
    id: 'step-street',
    coordinates: {
      latitude: currentStepPoint.latitude,
      longitude: currentStepPoint.longitude,
    },
    title: currentStepName.trim(),
  };
}

function buildPolylines(
  polyline: LatLng[],
  alternativePolyline?: LatLng[],
  alternativePolylines?: LatLng[][]
): PolylineStyle[] {
  const routeCoords = polyline.map((p) => ({
    latitude: p.latitude,
    longitude: p.longitude,
  }));
  const altLines =
    alternativePolylines && alternativePolylines.length > 0
      ? alternativePolylines
      : alternativePolyline
        ? [alternativePolyline]
        : [];

  return [
    ...altLines.flatMap((line, i) => {
      const coords = line.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
      }));
      if (coords.length < 2) return [];
      return [
        {
          id: `route-alt-${i}`,
          coordinates: coords,
          color: navChrome.route.altColor,
          width: navChrome.route.altWidth,
        },
      ];
    }),
    ...(routeCoords.length > 1
      ? [
          {
            id: 'route',
            coordinates: routeCoords,
            color: navChrome.route.color,
            width: navChrome.route.width,
          },
        ]
      : []),
  ];
}

function buildUserHalo(location: Location | null) {
  if (location == null) return [];
  return [
    {
      id: 'user-halo',
      center: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
      radius: 18,
      color: 'rgba(51,181,229,0.22)',
      lineColor: 'rgba(51,181,229,0.35)',
      lineWidth: 1,
    },
  ];
}

function buildAppleAnnotations(input: {
  startPoint: RoutePoint;
  endPoint: RoutePoint;
  waypoints: Waypoint[];
  location: Location | null;
  streetLabel: StreetLabel | null;
  originIcon?: MapMarkerImage;
  destIcon?: MapMarkerImage;
  userIcon?: MapMarkerImage;
  defaultViaIcon?: MapMarkerImage;
  originTitle: string;
  destTitle: string;
}): Record<string, unknown>[] {
  const {
    startPoint,
    endPoint,
    waypoints,
    location,
    streetLabel,
    originIcon,
    destIcon,
    userIcon,
    defaultViaIcon,
    originTitle,
    destTitle,
  } = input;

  const centerAnchor = { x: 0.5, y: 0.5 };

  const annotations: Record<string, unknown>[] = [
    {
      id: 'start',
      coordinates: {
        latitude: startPoint.latitude,
        longitude: startPoint.longitude,
      },
      title: originTitle,
      anchor: centerAnchor,
      ...(originIcon
        ? { icon: originIcon }
        : {
            systemImage: startPoint.systemImage ?? 'flag.checkered',
            tintColor: startPoint.tintColor ?? navChrome.colors.accent,
          }),
    },
    ...waypoints.map((w, i) => {
      const icon = resolveIcon(w) ?? defaultViaIcon;
      return {
        id: `wp-${i}`,
        coordinates: { latitude: w.latitude, longitude: w.longitude },
        title: pointLabel(w, `Waypoint ${i + 1}`),
        anchor: centerAnchor,
        ...(icon
          ? { icon }
          : {
              systemImage: w.systemImage ?? 'mappin.circle.fill',
              tintColor: w.tintColor ?? navChrome.colors.accentDeep,
            }),
      };
    }),
    {
      id: 'end',
      coordinates: {
        latitude: endPoint.latitude,
        longitude: endPoint.longitude,
      },
      title: destTitle,
      anchor: centerAnchor,
      ...(destIcon
        ? { icon: destIcon }
        : {
            systemImage: endPoint.systemImage ?? 'flag.fill',
            tintColor: endPoint.tintColor ?? navChrome.colors.cancel,
          }),
    },
    ...(streetLabel ? [streetLabel] : []),
  ];

  if (location && userIcon) {
    annotations.push({
      id: 'user',
      coordinates: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
      icon: userIcon,
    });
  }

  return annotations;
}

function buildAppleUserMarkers(
  location: Location | null,
  userIcon: MapMarkerImage | undefined,
  userMarker?: MarkerStyle
): Record<string, unknown>[] {
  if (!location || userIcon) return [];
  return [
    {
      id: 'user',
      coordinates: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
      systemImage: userMarker?.systemImage ?? 'location.north.line.fill',
      tintColor: userMarker?.tintColor ?? navChrome.colors.accent,
    },
  ];
}

function buildGoogleMarkers(input: {
  startPoint: RoutePoint;
  endPoint: RoutePoint;
  waypoints: Waypoint[];
  location: Location | null;
  streetLabel: StreetLabel | null;
  originIcon?: MapMarkerImage;
  destIcon?: MapMarkerImage;
  userIcon?: MapMarkerImage;
  defaultViaIcon?: MapMarkerImage;
  originTitle: string;
  destTitle: string;
}): Record<string, unknown>[] {
  const {
    startPoint,
    endPoint,
    waypoints,
    location,
    streetLabel,
    originIcon,
    destIcon,
    userIcon,
    defaultViaIcon,
    originTitle,
    destTitle,
  } = input;

  const centerAnchor = { x: 0.5, y: 0.5 };

  return [
    {
      id: 'start',
      coordinates: {
        latitude: startPoint.latitude,
        longitude: startPoint.longitude,
      },
      title: originTitle,
      anchor: centerAnchor,
      ...(originIcon ? { icon: originIcon } : {}),
    },
    ...waypoints.map((w, i) => {
      const icon = resolveIcon(w) ?? defaultViaIcon;
      return {
        id: `wp-${i}`,
        coordinates: { latitude: w.latitude, longitude: w.longitude },
        title: pointLabel(w, `Waypoint ${i + 1}`),
        anchor: centerAnchor,
        ...(icon ? { icon } : {}),
      };
    }),
    {
      id: 'end',
      coordinates: {
        latitude: endPoint.latitude,
        longitude: endPoint.longitude,
      },
      title: destTitle,
      anchor: centerAnchor,
      ...(destIcon ? { icon: destIcon } : {}),
    },
    ...(streetLabel
      ? [
          {
            id: streetLabel.id,
            coordinates: streetLabel.coordinates,
            title: streetLabel.title,
          },
        ]
      : []),
    ...(location
      ? [
          {
            id: 'user',
            coordinates: {
              latitude: location.latitude,
              longitude: location.longitude,
            },
            anchor: centerAnchor,
            ...(userIcon ? { icon: userIcon } : {}),
          },
        ]
      : []),
  ];
}

type CameraMoveHandler = (event?: {
  coordinates?: { latitude?: number; longitude?: number };
  bearing?: number;
}) => void;

function AppleNavMap({
  mapRef,
  cameraPosition,
  annotations,
  markers,
  polylines,
  circles,
  onCameraMove,
}: {
  mapRef: Ref<MapRef | null>;
  cameraPosition: {
    coordinates: Coordinate;
    zoom: number;
    bearing: number;
  };
  annotations: Record<string, unknown>[];
  markers: Record<string, unknown>[];
  polylines: PolylineStyle[];
  circles: ReturnType<typeof buildUserHalo>;
  onCameraMove: CameraMoveHandler;
}) {
  return (
    <View style={styles.map} testID="navigation-map">
      <AppleMaps.View
        ref={mapRef as never}
        style={StyleSheet.absoluteFill}
        cameraPosition={cameraPosition}
        properties={{
          isTrafficEnabled: false,
        }}
        uiSettings={{
          myLocationButtonEnabled: false,
          compassEnabled: false,
          scaleBarEnabled: false,
          togglePitchEnabled: false,
        }}
        annotations={annotations as never}
        polylines={polylines}
        circles={circles as never}
        markers={markers as never}
        onCameraMove={onCameraMove}
      />
    </View>
  );
}

function GoogleNavMap({
  mapRef,
  cameraPosition,
  markers,
  polylines,
  circles,
  showNativeMyLocation,
  onCameraMove,
}: {
  mapRef: Ref<MapRef | null>;
  cameraPosition: {
    coordinates: Coordinate;
    zoom: number;
    bearing: number;
  };
  markers: Record<string, unknown>[];
  polylines: PolylineStyle[];
  circles: ReturnType<typeof buildUserHalo>;
  showNativeMyLocation: boolean;
  onCameraMove: CameraMoveHandler;
}) {
  return (
    <View style={styles.map} testID="navigation-map">
      <GoogleMaps.View
        ref={mapRef as never}
        style={StyleSheet.absoluteFill}
        cameraPosition={cameraPosition}
        colorScheme={GoogleMaps.MapColorScheme.LIGHT}
        properties={{
          isTrafficEnabled: false,
          isMyLocationEnabled: showNativeMyLocation,
          mapStyleOptions: { json: GOOGLE_MUTED_MAP_STYLE },
        }}
        uiSettings={{
          myLocationButtonEnabled: false,
          compassEnabled: false,
          zoomControlsEnabled: false,
          tiltGesturesEnabled: false,
          rotationGesturesEnabled: true,
          scrollGesturesEnabled: true,
          scrollGesturesEnabledDuringRotateOrZoom: true,
          zoomGesturesEnabled: true,
        }}
        markers={markers as never}
        polylines={polylines}
        circles={circles as never}
        onCameraMove={onCameraMove}
      />
    </View>
  );
}

export const NavigationMap = forwardRef<NavigationMapHandle, Props>(
  function NavigationMap(
    {
      polyline,
      alternativePolyline,
      alternativePolylines,
      location,
      startPoint,
      endPoint,
      currentStepName,
      currentStepPoint,
      cameraLookAheadPoint,
      waypoints = EMPTY_WAYPOINTS,
      userMarker,
      defaultStartIcon,
      defaultEndIcon,
      defaultViaIcon,
      followUser = true,
      zoom = FOLLOW_ZOOM,
      onCameraMoveByUser,
    },
    ref
  ) {
    const appleRef = useRef<MapRef | null>(null);
    const googleRef = useRef<MapRef | null>(null);
    const programmaticMoveUntil = useRef(0);
    const lastCameraAt = useRef(0);
    const lastCameraPos = useRef<Coordinate | null>(null);
    const lastCameraBearing = useRef<number | null>(null);
    const prevFollowRef = useRef(followUser);
    const followUserRef = useLatestRef(followUser);
    const lookAheadRef = useLatestRef(cameraLookAheadPoint);
    const platform = Platform.OS as FollowingPlatform;
    const androidDurationMs = followAndroidDurationMs(platform);
    const moveGuardMs = programmaticMoveGuardMs(
      platform,
      platform === 'android' ? androidDurationMs : 0
    );
    /** Seed for the controlled prop — avoid rewriting it every GPS tick (fights setCamera). */
    const seedCameraRef = useRef({
      coordinates: {
        latitude:
          location?.latitude ??
          polyline[0]?.latitude ??
          endPoint.latitude,
        longitude:
          location?.longitude ??
          polyline[0]?.longitude ??
          endPoint.longitude,
      },
      zoom,
      bearing: Number.isFinite(location?.heading)
        ? (location!.heading as number)
        : 0,
    });

    const setCamera = (config: {
      coordinates: Coordinate;
      zoom?: number;
      bearing?: number;
      speedMps?: number;
      /** Bypass move/bearing/time gates (recenter / compass / follow arm). */
      force?: boolean;
    }) => {
      const courseHeading = Number.isFinite(config.bearing)
        ? (config.bearing as number)
        : (lastCameraBearing.current ?? 0);
      const bearing = computeLookAheadBearing(
        courseHeading,
        config.coordinates,
        lookAheadRef.current
      );

      const decision = shouldUpdateFollowingCamera({
        lastPos: lastCameraPos.current,
        lastBearing: lastCameraBearing.current,
        lastAt: lastCameraAt.current,
        nextPos: config.coordinates,
        nextBearing: bearing,
        speedMps: config.speedMps,
        force: config.force,
        platform,
        animationDurationMs:
          platform === 'android' ? androidDurationMs : 0,
      });
      if (!decision.update) return;

      // Longer settle after force/arm so live GPS / MapKit load events don't
      // immediately drop into free mode before FollowBreakSurface is usable.
      const guardMs = config.force
        ? Math.max(moveGuardMs, platform === 'ios' ? 1200 : 600)
        : moveGuardMs;
      programmaticMoveUntil.current = Date.now() + guardMs;
      lastCameraAt.current = Date.now();
      lastCameraPos.current = {
        latitude: config.coordinates.latitude,
        longitude: config.coordinates.longitude,
      };
      lastCameraBearing.current = bearing;
      seedCameraRef.current = {
        coordinates: { ...lastCameraPos.current },
        zoom: config.zoom ?? zoom,
        bearing,
      };

      const camera = {
        coordinates: {
          latitude: config.coordinates.latitude,
          longitude: config.coordinates.longitude,
        },
        zoom: config.zoom ?? zoom,
        bearing,
      };
      if (Platform.OS === 'ios') {
        // expo-maps iOS has no animation duration — sparse gated jumps feel smoother.
        appleRef.current?.setCameraPosition?.(camera);
      } else {
        googleRef.current?.setCameraPosition?.({
          ...camera,
          duration: androidDurationMs,
        });
      }
    };

    useImperativeHandle(ref, () => ({
      setCameraPosition: (config) => setCamera({ ...config, force: true }),
    }));

    // Arm / re-arm course-up when follow turns on. Puck updates every tick;
    // camera frames are gated inside setCamera unless force.
    useEffect(() => {
      const wasFollowing = prevFollowRef.current;
      prevFollowRef.current = followUser;
      if (!followUser || !location) return;
      const heading = Number.isFinite(location.heading)
        ? location.heading
        : (lastCameraBearing.current ?? 0);
      const justArmed = !wasFollowing && followUser;
      const firstFix = lastCameraBearing.current == null;
      setCamera({
        coordinates: location,
        zoom,
        bearing: heading,
        speedMps: location.speed,
        force: justArmed || firstFix,
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      followUser,
      location?.latitude,
      location?.longitude,
      location?.heading,
      location?.speed,
      zoom,
      cameraLookAheadPoint?.latitude,
      cameraLookAheadPoint?.longitude,
    ]);

    /**
     * Google-style free mode via map camera events (Android / when MapKit
     * reports the gesture). Programmatic follow frames are ignored via a short
     * guard + proximity filter.
     */
    const handleCameraMove = (event?: {
      coordinates?: { latitude?: number; longitude?: number };
      bearing?: number;
    }) => {
      if (!followUserRef.current) return;
      if (Date.now() < programmaticMoveUntil.current) return;
      // Live GPS: MapKit often fires camera events before the first follow
      // frame is armed. Without a programmatic target, treat as settle noise.
      if (lastCameraPos.current == null) return;

      const lat = event?.coordinates?.latitude;
      const lon = event?.coordinates?.longitude;
      if (
        lat != null &&
        lon != null &&
        Number.isFinite(lat) &&
        Number.isFinite(lon)
      ) {
        const moved = distanceMeters(lastCameraPos.current, {
          latitude: lat,
          longitude: lon,
        });
        const bearing = Number.isFinite(event?.bearing)
          ? (event!.bearing as number)
          : (lastCameraBearing.current ?? 0);
        const turned =
          lastCameraBearing.current != null
            ? bearingDeltaDeg(lastCameraBearing.current, bearing)
            : 0;
        // Animation settle / float noise around the last programmatic target.
        if (moved < 20 && turned < 12) return;
      } else {
        // No usable coordinates — ignore (don't drop into free mode).
        return;
      }

      onCameraMoveByUser?.();
    };

    const polylines = useMemo(
      () =>
        buildPolylines(polyline, alternativePolyline, alternativePolylines),
      [polyline, alternativePolyline, alternativePolylines]
    );

    const originIcon = resolveIcon(startPoint) ?? defaultStartIcon;
    const destIcon = resolveIcon(endPoint) ?? defaultEndIcon;
    const userIcon = resolveIcon(userMarker);
    const originTitle = pointLabel(startPoint, 'Start');
    const destTitle = pointLabel(endPoint, 'Destination');

    const streetLabel = useMemo(
      () => buildStreetLabel(currentStepName, currentStepPoint),
      [currentStepName, currentStepPoint]
    );

    const userHalo = useMemo(() => buildUserHalo(location), [location]);

    const routeMarkerInput = useMemo(
      () => ({
        startPoint,
        endPoint,
        waypoints,
        location: null as Location | null,
        streetLabel: null as StreetLabel | null,
        originIcon,
        destIcon,
        userIcon: undefined as MapMarkerImage | undefined,
        defaultViaIcon,
        originTitle,
        destTitle,
      }),
      [
        startPoint,
        endPoint,
        waypoints,
        originIcon,
        destIcon,
        defaultViaIcon,
        originTitle,
        destTitle,
      ]
    );

    const appleAnnotations = useMemo(() => {
      const base = buildAppleAnnotations(routeMarkerInput);
      const withStreet = streetLabel
        ? [...base, streetLabel as unknown as Record<string, unknown>]
        : base;
      if (location && userIcon) {
        return [
          ...withStreet,
          {
            id: 'user',
            coordinates: {
              latitude: location.latitude,
              longitude: location.longitude,
            },
            icon: userIcon,
            anchor: { x: 0.5, y: 0.5 },
          },
        ];
      }
      return withStreet;
    }, [routeMarkerInput, streetLabel, location, userIcon]);

    const appleUserMarkers = useMemo(
      () => buildAppleUserMarkers(location, userIcon, userMarker),
      [location, userIcon, userMarker]
    );

    const googleMarkers = useMemo(
      () =>
        buildGoogleMarkers({
          ...routeMarkerInput,
          location,
          streetLabel,
          userIcon,
        }),
      [routeMarkerInput, location, streetLabel, userIcon]
    );

    // Controlled seed only — never rewrite from live GPS while the user has
    // panned into free mode (that would yank the camera back to the puck).
    // Imperative setCamera updates the seed while following / on recenter.
    const cameraPosition = seedCameraRef.current;

    if (Platform.OS === 'ios') {
      return (
        <AppleNavMap
          mapRef={appleRef}
          cameraPosition={cameraPosition}
          annotations={appleAnnotations}
          markers={appleUserMarkers}
          polylines={polylines}
          circles={userHalo}
          onCameraMove={handleCameraMove}
        />
      );
    }

    return (
      <GoogleNavMap
        mapRef={googleRef}
        cameraPosition={cameraPosition}
        markers={googleMarkers}
        polylines={polylines}
        circles={userHalo}
        showNativeMyLocation={!location}
        onCameraMove={handleCameraMove}
      />
    );
  }
);

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});
