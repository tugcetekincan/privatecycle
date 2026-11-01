import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { floatingShadow, radii, spacing, typography } from '@/design/tokens';
import { Check, X, AlertTriangle, Info, HelpCircle } from 'lucide-react-native';

export interface DialogButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive' | 'primary';
}

export interface DialogProps {
  visible: boolean;
  title: string;
  message?: string;
  type?: 'success' | 'error' | 'warning' | 'info' | 'confirm';
  buttons?: DialogButton[];
  onDismiss?: () => void;
  children?: React.ReactNode;
}

const CustomDialog: React.FC<DialogProps> = ({
  visible,
  title,
  message,
  type = 'info',
  buttons = [{ text: 'OK', style: 'primary' }],
  onDismiss,
  children,
}) => {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const styles = createStyles(theme);

  const getIcon = () => {
    const iconSize = 24;
    const iconColor = getIconColor();
    
    switch (type) {
      case 'success':
        return <Check size={iconSize} color={iconColor} />;
      case 'error':
        return <X size={iconSize} color={iconColor} />;
      case 'warning':
        return <AlertTriangle size={iconSize} color={iconColor} />;
      case 'info':
        return <Info size={iconSize} color={iconColor} />;
      case 'confirm':
        return <HelpCircle size={iconSize} color={iconColor} />;
      default:
        return <Info size={iconSize} color={iconColor} />;
    }
  };

  const getIconColor = () => {
    switch (type) {
      case 'success':
        return theme.colors.success;
      case 'error':
        return theme.colors.error;
      case 'warning':
        return theme.colors.warning;
      case 'info':
        return theme.colors.primary;
      case 'confirm':
        return theme.colors.warning;
      default:
        return theme.colors.primary;
    }
  };

  const getIconBackgroundColor = () => {
    const baseColor = getIconColor();
    return theme.isDark ? `${baseColor}20` : `${baseColor}10`;
  };

  const handleButtonPress = (button: DialogButton) => {
    // Dismiss first: the action may synchronously open a follow-up dialog.
    onDismiss?.();
    if (button.onPress) {
      button.onPress();
    }
  };

  const getButtonStyle = (buttonStyle: string, index: number, total: number) => {
    const isVerticalLayout = total > 2;
    
    if (isVerticalLayout) {
      switch (buttonStyle) {
        case 'primary':
          return [styles.verticalButton, styles.primaryButton];
        case 'destructive':
          return [styles.verticalButton, styles.destructiveButton];
        case 'cancel':
          return [styles.verticalButton, styles.cancelVerticalButton];
        default:
          return [styles.verticalButton, styles.defaultButton];
      }
    } else {
      switch (buttonStyle) {
        case 'primary':
          return [styles.button, styles.primaryButton];
        case 'destructive':
          return [styles.button, styles.destructiveButton];
        case 'cancel':
          return [styles.button, styles.cancelButton];
        default:
          return [styles.button, styles.defaultButton];
      }
    }
  };

  const getButtonTextStyle = (buttonStyle: string) => {
    switch (buttonStyle) {
      case 'primary':
        return [styles.buttonText, styles.primaryButtonText];
      case 'destructive':
        return [styles.buttonText, styles.destructiveButtonText];
      case 'cancel':
        return [styles.buttonText, styles.cancelButtonText];
      default:
        return [styles.buttonText, styles.defaultButtonText];
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View testID="dialog" accessibilityViewIsModal style={styles.dialog}>
          <ScrollView bounces={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: getIconBackgroundColor() }]}>
              {getIcon()}
            </View>
            <Text testID="dialog-title" accessibilityRole="header" style={styles.title}>{title}</Text>
          </View>

          <View style={styles.content}>
            {message && (
              <Text testID="dialog-message" style={styles.message}>{message}</Text>
            )}
            {children}
          </View>

          <View style={[styles.buttonContainer, buttons.length > 2 && styles.verticalButtonContainer]}>
            {buttons.map((button, index) => (
              <TouchableOpacity
                key={index}
                accessibilityRole="button"
                testID={`dialog-button-${button.text
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, '')}`}
                style={getButtonStyle(button.style || 'default', index, buttons.length)}
                onPress={() => handleButtonPress(button)}
                activeOpacity={0.7}
              >
                <Text style={getButtonTextStyle(button.style || 'default')}>
                  {button.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    backgroundColor: theme.colors.surface,
    borderRadius: radii.hero,
    borderWidth: 1,
    borderColor: theme.colors.border,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    ...floatingShadow(theme),
  },
  header: {
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 14,
  },
  scrollContent: { flexGrow: 1 },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: radii.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: theme.colors.text,
    textAlign: 'center',
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 22,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    borderBottomLeftRadius: radii.hero,
    borderBottomRightRadius: radii.hero,
    overflow: 'hidden',
    minHeight: 54,
  },
  verticalButtonContainer: {
    flexDirection: 'column',
  },
  button: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  verticalButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    minHeight: 50,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    color: theme.colors.white,
  },
  destructiveButton: {
    backgroundColor: 'transparent',
  },
  destructiveButtonText: {
    color: theme.colors.error,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  cancelVerticalButton: {
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    color: theme.colors.textSecondary,
  },
  defaultButton: {
    backgroundColor: 'transparent',
  },
  defaultButtonText: {
    color: theme.colors.primary,
  },
});

export default CustomDialog;
