import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

interface ScreenFadeProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * The one piece of entrance motion in the app: a quiet 220ms fade/6px rise
 * whenever a tab gains focus. Skipped when the OS asks for reduced motion.
 */
export default function ScreenFade({ children, style }: ScreenFadeProps) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (reduceMotion) {
        opacity.setValue(1);
        translateY.setValue(0);
        return undefined;
      }

      opacity.setValue(0.94);
      translateY.setValue(6);
      const animation = Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);
      animation.start();

      return () => animation.stop();
    }, [opacity, reduceMotion, translateY])
  );

  return (
    <Animated.View
      style={[
        styles.container,
        style,
        { opacity, transform: [{ translateY }] },
      ]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
