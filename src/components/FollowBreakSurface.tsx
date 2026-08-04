import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  top: number;
  bottom: number;
  onBreakFollow: () => void;
};

/**
 * Drag-to-break-follow overlay. expo-maps does not expose pan-start; this
 * layer sits above the map (below HUD) and unmounts once free mode starts.
 */
export function FollowBreakSurface({ top, bottom, onBreakFollow }: Props) {
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  return (
    <View
      testID="map-follow-surface"
      accessible
      accessibilityLabel="Map follow surface"
      collapsable={false}
      style={[styles.surface, { top, bottom }]}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => {
        dragStart.current = {
          x: e.nativeEvent.pageX,
          y: e.nativeEvent.pageY,
        };
      }}
      onResponderMove={(e) => {
        const start = dragStart.current;
        if (!start) return;
        const dx = e.nativeEvent.pageX - start.x;
        const dy = e.nativeEvent.pageY - start.y;
        if (dx * dx + dy * dy >= 12 * 12) {
          dragStart.current = null;
          onBreakFollow();
        }
      }}
      onResponderRelease={() => {
        dragStart.current = null;
      }}
      onResponderTerminate={() => {
        dragStart.current = null;
      }}
    >
      <Text style={styles.a11y}>Map follow surface</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 4,
    backgroundColor: 'rgba(0,0,0,0.01)',
  },
  a11y: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});
