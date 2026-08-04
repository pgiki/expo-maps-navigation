import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Compass, MenuIcon, Volume2, VolumeX } from 'lucide-react-native';

import { NavIcon } from './NavIcon';
import { t } from '../i18n/strings';
import type { Language } from '../locals';
import { navChrome } from '../theme/navChrome';
import { elevatedShadow } from '../theme/shadows';

type Props = {
  mute?: boolean;
  language?: Language;
  distanceUnit?: 'metric' | 'imperial';
  /** Ground speed in m/s. */
  speedMps?: number | null;
  currentStreet?: string;
  /** Space reserved for the bottom trip sheet. */
  bottomOffset?: number;
  onCompassPress?: () => void;
  onToggleMute?: () => void;
  onPressMenu?: () => void;
};

export function MapHud({
  mute = false,
  language = 'en',
  distanceUnit = 'metric',
  speedMps,
  currentStreet,
  bottomOffset = 120,
  onCompassPress,
  onToggleMute,
  onPressMenu,
}: Props) {
  const speedLabel = formatSpeed(speedMps, distanceUnit);
  const street = currentStreet?.trim();

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View
        style={[styles.rightStack, { bottom: bottomOffset + 8 }]}
        pointerEvents="box-none"
      >
        <Pressable
          testID="compass-button"
          accessibilityRole="button"
          accessibilityLabel={t('compassNorth', language)}
          onPress={onCompassPress}
          style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
        >
          <NavIcon icon={Compass} />
        </Pressable>

        <Pressable
          testID="mute-button"
          accessibilityRole="button"
          accessibilityLabel={mute ? t('unmute', language) : t('mute', language)}
          onPress={onToggleMute}
          style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
        >
          <NavIcon icon={mute ? VolumeX : Volume2} />
        </Pressable>
        {onPressMenu ? (
          <Pressable
            testID="menu-button"
            accessibilityRole="button"
            accessibilityLabel={t('menu', language)}
            onPress={onPressMenu}
            style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
          >
            <NavIcon icon={MenuIcon} />
          </Pressable>
        ) : null}
      </View>

      <View
        style={[styles.speedBadge, { bottom: bottomOffset + 8 }]}
        testID="speed-badge"
        pointerEvents="none"
      >
        <Text style={styles.speedValue} testID="speed-value">
          {speedLabel.value}
        </Text>
        <Text style={styles.speedUnit}>{speedLabel.unit}</Text>
      </View>

      {street ? (
        <View
          style={[styles.streetChip, { bottom: bottomOffset + 8 }]}
          testID="current-street-chip"
          pointerEvents="none"
        >
          <Text style={styles.streetChipText} numberOfLines={1}>
            {street}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function formatSpeed(
  speedMps: number | null | undefined,
  unit: 'metric' | 'imperial'
): { value: string; unit: string } {
  const mps = speedMps != null && speedMps > 0 ? speedMps : 0;
  if (unit === 'imperial') {
    const mph = Math.round(mps * 2.236936);
    return { value: String(mph), unit: 'mph' };
  }
  const kmh = Math.round(mps * 3.6);
  return { value: String(kmh), unit: 'km/h' };
}

const styles = StyleSheet.create({
  rightStack: {
    position: 'absolute',
    right: navChrome.space.edge,
    alignItems: 'center',
    gap: navChrome.space.gap,
    zIndex: 12,
  },
  fab: {
    width: navChrome.space.fab,
    height: navChrome.space.fab,
    borderRadius: navChrome.radius.fab,
    backgroundColor: navChrome.colors.fabBg,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevatedShadow(3, 8, 0.22, 6),
  },
  pressed: {
    opacity: 0.8,
  },
  speedBadge: {
    position: 'absolute',
    left: navChrome.space.edge,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: navChrome.colors.speedBg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12,
    ...elevatedShadow(2, 6, 0.25, 5),
  },
  speedValue: {
    color: navChrome.colors.speedFg,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 26,
  },
  speedUnit: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: -1,
  },
  streetChip: {
    position: 'absolute',
    alignSelf: 'center',
    left: 88,
    right: 72,
    backgroundColor: navChrome.colors.sheetBg,
    borderRadius: navChrome.radius.chip,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    zIndex: 12,
    ...elevatedShadow(2, 8, 0.16, 4),
  },
  streetChipText: {
    color: navChrome.colors.sheetFg,
    fontSize: 14,
    fontWeight: '600',
  },
});
