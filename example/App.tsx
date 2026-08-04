import { useMemo, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useImage } from 'expo-image';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ExpoMapsNavigation, {
  type RoutePoint,
  type Waypoint,
} from 'expo-maps-navigation';

type Mode = 'idle' | 'navigate' | 'fast' | 'error';

/**
 * Marker styles exercised in this example:
 * - startPoint → `icon` (PNG via useImage)
 * - endPoint → `image` alias (PNG via useImage)
 * - waypoint 1 → `icon` (PNG)
 * - waypoint 2 → iOS `systemImage` + tintColor
 */
export default function App() {
  const [mode, setMode] = useState<Mode>('idle');

  const startIcon = useImage(require('./assets/marker-start.png'), {
    maxWidth: 64,
    maxHeight: 64,
  });
  const endIcon = useImage(require('./assets/marker-end.png'), {
    maxWidth: 64,
    maxHeight: 64,
  });
  const shopIcon = useImage(require('./assets/marker-shop.png'), {
    maxWidth: 64,
    maxHeight: 64,
  });

  const startPoint = useMemo((): RoutePoint => {
    return {
      latitude: 30.699239,
      longitude: 76.6905161,
      name: 'Home',
      ...(startIcon
        ? { icon: startIcon }
        : { systemImage: 'house.fill', tintColor: '#1A73E8' }),
    };
  }, [startIcon]);

  const endPoint = useMemo((): RoutePoint => {
    return {
      latitude: 30.709241,
      longitude: 76.695669,
      name: 'Pickup',
      ...(endIcon
        ? { image: endIcon }
        : { systemImage: 'flag.fill', tintColor: '#E53935' }),
    };
  }, [endIcon]);

  const waypoints = useMemo((): Waypoint[] => {
    return [
      {
        latitude: 30.701982,
        longitude: 76.693183,
        name: 'Shop stop',
        separatesLegs: true,
        ...(shopIcon
          ? { icon: shopIcon }
          : { systemImage: 'bag.fill', tintColor: '#1A9BC4' }),
      },
      {
        latitude: 30.704476,
        longitude: 76.690653,
        name: 'Cafe',
        separatesLegs: false,
        systemImage: 'cup.and.saucer.fill',
        tintColor: '#7B61FF',
      },
    ];
  }, [shopIcon]);

  let content: ReactNode;

  if (mode === 'idle') {
    content = (
      <View style={styles.container} testID="home-screen">
        <StatusBar style="auto" />
        <View style={styles.main}>
          <Text style={styles.brand} testID="app-title">
            Expo Maps Navigation
          </Text>
          <Text style={styles.heading}>Turn-by-turn · OSRM</Text>
          <Pressable
            testID="start-navigation"
            accessibilityRole="button"
            accessibilityLabel="Start Navigation"
            onPress={() => setMode('navigate')}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryBtnText}>Start Navigation</Text>
          </Pressable>
          <Pressable
            testID="start-fast-simulation"
            accessibilityRole="button"
            accessibilityLabel="Start Fast Simulation"
            onPress={() => setMode('fast')}
            style={({ pressed }) => [
              styles.secondaryBtn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryBtnText}>Start Fast Simulation</Text>
          </Pressable>
          <Pressable
            testID="start-error-route"
            accessibilityRole="button"
            accessibilityLabel="Force Route Error"
            onPress={() => setMode('error')}
            style={({ pressed }) => [
              styles.secondaryBtn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryBtnText}>Force Route Error</Text>
          </Pressable>
        </View>
      </View>
    );
  } else {
    content = (
      <>
        <StatusBar style="light" />
        <ExpoMapsNavigation
          startPoint={startPoint}
          endPoint={endPoint}
          travelMode="driving"
          osrmBaseUrl={
            mode === 'error'
              ? 'https://osrm.invalid.example'
              : 'https://router.project-osrm.org'
          }
          style={styles.container}
          shouldSimulateRoute={mode !== 'error'}
          simulationSpeedMultiplier={mode === 'fast' ? 20 : 1}
          showCancelButton
          showsEndOfRouteFeedback={mode !== 'error'}
          waypoints={waypoints}
          language="en"
          distanceUnit="metric"
          onCancelNavigation={() => {
            setMode('idle');
          }}
          onArrive={(point) => {
            console.log('onArrive', point);
          }}
          onRouteProgressChange={(progress) => {
            console.log('progress', progress.fractionTraveled.toFixed(2));
          }}
          onError={(error) => {
            console.log('onError', error);
          }}
        />
      </>
    );
  }

  return <SafeAreaProvider>{content}</SafeAreaProvider>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  main: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
    backgroundColor: '#F8FAFC',
  },
  brand: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0B1220',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  heading: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  primaryBtn: {
    backgroundColor: '#0B1220',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#0B1220',
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
  },
});
