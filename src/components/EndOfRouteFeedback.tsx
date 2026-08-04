import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { t } from '../i18n/strings';
import type { Language } from '../locals';
import { navChrome } from '../theme/navChrome';

type Props = {
  language?: Language;
  destinationTitle?: string;
  onDone: () => void;
};

export function EndOfRouteFeedback({
  language = 'en',
  destinationTitle,
  onDone,
}: Props) {
  return (
    <View style={styles.overlay} testID="end-of-route">
      <View style={styles.sheet}>
        <View style={styles.checkWell}>
          <Check size={32} color="#FFFFFF" strokeWidth={3} />
        </View>
        <Text style={styles.title} testID="arrived-title">
          {t('endOfRouteTitle', language)}
        </Text>
        {destinationTitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {destinationTitle}
          </Text>
        ) : null}
        <Pressable
          testID="arrived-done"
          accessibilityRole="button"
          accessibilityLabel={t('endOfRouteDone', language)}
          onPress={onDone}
          style={({ pressed }) => [
            styles.btn,
            pressed && { opacity: 0.88 },
          ]}
        >
          <Text style={styles.btnText}>{t('endOfRouteDone', language)}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: navChrome.colors.overlay,
    justifyContent: 'flex-end',
    zIndex: 20,
  },
  sheet: {
    backgroundColor: navChrome.colors.sheetBg,
    borderTopLeftRadius: navChrome.radius.sheet,
    borderTopRightRadius: navChrome.radius.sheet,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 36,
    alignItems: 'center',
  },
  checkWell: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: navChrome.colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: navChrome.colors.sheetFg,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    color: navChrome.colors.sheetMuted,
    textAlign: 'center',
  },
  btn: {
    marginTop: 20,
    alignSelf: 'stretch',
    backgroundColor: navChrome.colors.bannerBg,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: {
    color: navChrome.colors.bannerFg,
    fontSize: 16,
    fontWeight: '700',
  },
});
