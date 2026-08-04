import { StyleSheet, Text, View } from 'react-native';

import { ManeuverIcon } from './ManeuverIcon';
import type { OsrmManeuver } from '../osrm/instructions';
import { formatDistance } from '../osrm/progress';
import { navChrome } from '../theme/navChrome';
import { elevatedShadow } from '../theme/shadows';

type Props = {
  instruction: string;
  /** Preferred one-line street / road name when available. */
  streetName?: string;
  distanceToNextManeuver: number;
  maneuver?: OsrmManeuver;
  distanceUnit?: 'metric' | 'imperial';
  topInset?: number;
};

export function ManeuverBanner({
  instruction,
  streetName,
  distanceToNextManeuver,
  maneuver,
  distanceUnit = 'metric',
  topInset = 52,
}: Props) {
  const line = (streetName?.trim() || instruction).trim();

  return (
    <View
      style={[styles.banner, { paddingTop: Math.max(10, topInset + 4) }]}
      pointerEvents="none"
      testID="maneuver-banner"
      accessibilityLabel={`Next: ${line}`}
    >
      <View style={styles.row}>
        <View style={styles.iconWell}>
          <ManeuverIcon
            maneuver={maneuver ?? { type: 'continue', modifier: 'straight' }}
            size={28}
            color={navChrome.colors.bannerFg}
          />
        </View>
        <View style={styles.textCol}>
          <Text
            style={styles.distance}
            numberOfLines={1}
            testID="maneuver-distance"
          >
            {formatDistance(distanceToNextManeuver, distanceUnit)}
          </Text>
          <Text
            style={styles.street}
            numberOfLines={1}
            testID="maneuver-instruction"
          >
            {line}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: navChrome.colors.bannerBg,
    paddingBottom: navChrome.space.bannerPadV + 4,
    paddingHorizontal: navChrome.space.bannerPadH,
    ...elevatedShadow(4, 10, 0.35, 10),
    zIndex: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: navChrome.space.gap,
  },
  iconWell: {
    width: navChrome.space.iconWell,
    height: navChrome.space.iconWell,
    borderRadius: 10,
    backgroundColor: navChrome.colors.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  distance: {
    color: navChrome.colors.bannerFg,
    fontSize: navChrome.type.distance,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 36,
  },
  street: {
    color: navChrome.colors.streetCyan,
    fontSize: navChrome.type.instruction,
    fontWeight: '600',
    marginTop: 0,
  },
});
