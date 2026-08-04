import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import { t } from '../i18n/strings';
import type { Language } from '../locals';
import { navChrome } from '../theme/navChrome';

const PADDED_CENTER: ViewStyle = {
  justifyContent: 'center',
  alignItems: 'center',
  paddingHorizontal: 24,
};

type GateProps = {
  style?: StyleProp<ViewStyle>;
  language: Language;
  message: string;
  testID: string;
  messageStyle?: TextStyle;
  onRetry?: () => void;
};

/** Loading / permission / error / cancelled placeholder screens. */
export function NavigationGateView({
  style,
  language,
  message,
  testID,
  messageStyle,
  onRetry,
}: GateProps) {
  return (
    <View style={[style, PADDED_CENTER, styles.centered]} testID={testID}>
      <Text style={[styles.message, messageStyle]} testID="nav-status">
        {message}
      </Text>
      {onRetry ? (
        <Pressable
          testID="permission-retry"
          accessibilityRole="button"
          accessibilityLabel={t('permissionRetry', language)}
          onPress={onRetry}
          style={({ pressed }) => [
            styles.retryBtn,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.retryBtnText}>
            {t('permissionRetry', language)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
  },
  message: {
    textAlign: 'center',
    fontSize: 16,
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: navChrome.colors.accent,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
