import type { ViewStyle } from 'react-native';

export function elevatedShadow(
  offsetY: number,
  blur: number,
  opacity: number,
  _elevation?: number
): ViewStyle {
  return {
    boxShadow: `0 ${offsetY}px ${blur}px rgba(0, 0, 0, ${opacity})`,
  };
}
