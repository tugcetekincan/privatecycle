import React, { useState, useCallback, ReactNode } from 'react';
import CustomDialog, { DialogButton, DialogProps } from '@/components/CustomDialog';

interface DialogState {
  visible: boolean;
  title: string;
  message?: string;
  type?: 'success' | 'error' | 'warning' | 'info' | 'confirm';
  buttons?: DialogButton[];
  children?: ReactNode;
}

export const useDialog = () => {
  const [dialogState, setDialogState] = useState<DialogState>({
    visible: false,
    title: '',
  });

  const hideDialog = useCallback(() => {
    setDialogState(prev => ({ ...prev, visible: false }));
  }, []);

  const showDialog = useCallback((config: Omit<DialogState, 'visible'>) => {
    setDialogState({
      ...config,
      visible: true,
    });
  }, []);

  const showSuccess = useCallback((title: string, message?: string, onOk?: () => void) => {
    showDialog({
      title,
      message,
      type: 'success',
      buttons: [
        {
          text: 'OK',
          style: 'primary',
          onPress: onOk,
        },
      ],
    });
  }, [showDialog]);

  const showError = useCallback((title: string, message?: string, onOk?: () => void) => {
    showDialog({
      title,
      message,
      type: 'error',
      buttons: [
        {
          text: 'OK',
          style: 'primary',
          onPress: onOk,
        },
      ],
    });
  }, [showDialog]);

  const showWarning = useCallback((title: string, message?: string, onOk?: () => void) => {
    showDialog({
      title,
      message,
      type: 'warning',
      buttons: [
        {
          text: 'OK',
          style: 'primary',
          onPress: onOk,
        },
      ],
    });
  }, [showDialog]);

  const showInfo = useCallback((title: string, message?: string, onOk?: () => void) => {
    showDialog({
      title,
      message,
      type: 'info',
      buttons: [
        {
          text: 'OK',
          style: 'primary',
          onPress: onOk,
        },
      ],
    });
  }, [showDialog]);

  const showConfirm = useCallback((
    title: string,
    message?: string,
    onConfirm?: () => void,
    onCancel?: () => void,
    confirmText: string = 'Confirm',
    cancelText: string = 'Cancel',
    isDestructive: boolean = false
  ) => {
    showDialog({
      title,
      message,
      type: 'confirm',
      buttons: [
        {
          text: cancelText,
          style: 'cancel',
          onPress: onCancel,
        },
        {
          text: confirmText,
          style: isDestructive ? 'destructive' : 'primary',
          onPress: onConfirm,
        },
      ],
    });
  }, [showDialog]);

  const showChoice = useCallback((
    title: string,
    message: string,
    choices: Array<{ text: string; onPress?: () => void }>,
    showCancel: boolean = true
  ) => {
    const buttons: DialogButton[] = [];
    
    if (showCancel) {
      buttons.push({
        text: 'Cancel',
        style: 'cancel',
      });
    }
    
    choices.forEach(choice => {
      buttons.push({
        text: choice.text,
        style: 'default',
        onPress: choice.onPress,
      });
    });

    showDialog({
      title,
      message,
      type: 'info',
      buttons,
    });
  }, [showDialog]);

  const DialogComponent = useCallback(() => (
    <CustomDialog
      visible={dialogState.visible}
      title={dialogState.title}
      message={dialogState.message}
      type={dialogState.type}
      buttons={dialogState.buttons}
      onDismiss={hideDialog}
    >
      {dialogState.children}
    </CustomDialog>
  ), [dialogState, hideDialog]);

  return {
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showConfirm,
    showChoice,
    showDialog,
    hideDialog,
    DialogComponent,
  };
}; 