import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GitBranch, Search, X } from 'lucide-react-native';

import { NavIcon } from './NavIcon';
import { t } from '../i18n/strings';
import type { Language } from '../locals';
import {
  formatDistance,
  formatDuration,
  formatEta,
} from '../osrm/progress';
import { navChrome } from '../theme/navChrome';
import { elevatedShadow } from '../theme/shadows';

type Props = {
  durationRemaining: number;
  distanceRemaining: number;
  distanceUnit?: 'metric' | 'imperial';
  language?: Language;
  showCancelButton?: boolean;
  /** Show alt-route cycle control when multiple routes exist. */
  showAltRoutesButton?: boolean;
  bottomInset?: number;
  onSearchPress?: () => void;
  onCancel?: () => void;
  onCycleRoutes?: () => void;
};

export function TripProgressBar({
  durationRemaining,
  distanceRemaining,
  distanceUnit = 'metric',
  language = 'en',
  showCancelButton = false,
  showAltRoutesButton = false,
  bottomInset = 28,
  onSearchPress,
  onCancel,
  onCycleRoutes,
}: Props) {
  const handleSearch = () => {
    if (onSearchPress) {
      onSearchPress();
      return;
    }
    Alert.alert(t('searchUnavailableTitle', language), t('searchUnavailableBody', language));
  };

  const subtitle = `${formatDuration(durationRemaining, language)} • ${formatDistance(
    distanceRemaining,
    distanceUnit
  )}`;

  return (
    <View
      style={[
        styles.wrap,
        { paddingBottom: Math.max(12, bottomInset + 4) },
      ]}
      testID="trip-progress"
    >
      <View style={styles.grabber} />

      <View style={styles.row}>
        <Pressable
          testID="search-button"
          accessibilityRole="button"
          accessibilityLabel={t('search', language)}
          onPress={handleSearch}
          style={({ pressed }) => [
            styles.circleBtn,
            pressed && styles.pressed,
          ]}
        >
          <NavIcon icon={Search} />
        </Pressable>

        <View style={styles.center}>
          <Text style={styles.eta} testID="trip-eta" numberOfLines={1}>
            {formatEta(durationRemaining)}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            <Text testID="trip-duration">
              {formatDuration(durationRemaining, language)}
            </Text>
            {' • '}
            <Text testID="trip-distance">
              {formatDistance(distanceRemaining, distanceUnit)}
            </Text>
          </Text>
          {/* Keep subtitle accessible as one line for VoiceOver */}
          <Text style={styles.a11yOnly}>{subtitle}</Text>
        </View>

        <View style={styles.rightActions}>
          {showAltRoutesButton ? (
            <Pressable
              testID="alt-routes-button"
              accessibilityRole="button"
              accessibilityLabel={t('altRoutes', language)}
              onPress={onCycleRoutes}
              style={({ pressed }) => [
                styles.circleBtn,
                pressed && styles.pressed,
              ]}
            >
              <NavIcon icon={GitBranch} />
            </Pressable>
          ) : null}

          {showCancelButton ? (
            <Pressable
              testID="cancel-navigation"
              accessibilityRole="button"
              accessibilityLabel={t('cancel', language)}
              onPress={onCancel}
              style={({ pressed }) => [
                styles.circleBtn,
                styles.cancelBtn,
                pressed && styles.pressed,
              ]}
            >
              <NavIcon
                icon={X}
                color={navChrome.colors.cancel}
                strokeWidth={2.5}
              />
            </Pressable>
          ) : !showAltRoutesButton ? (
            <View style={styles.circleBtnSpacer} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    backgroundColor: navChrome.colors.sheetBg,
    borderTopLeftRadius: navChrome.radius.sheet,
    borderTopRightRadius: navChrome.radius.sheet,
    paddingTop: 8,
    paddingHorizontal: 16,
    ...elevatedShadow(-4, 14, 0.18, 16),
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: navChrome.colors.sheetBorder,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 8,
  },
  eta: {
    fontSize: navChrome.type.eta,
    fontWeight: '700',
    color: navChrome.colors.sheetFg,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '500',
    color: navChrome.colors.sheetMuted,
  },
  a11yOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  circleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: navChrome.colors.muteBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtnSpacer: {
    width: 48,
    height: 48,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 48,
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    backgroundColor: navChrome.colors.cancelSoft,
  },
  pressed: {
    opacity: 0.75,
  },
});
