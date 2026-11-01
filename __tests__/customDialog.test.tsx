import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import CustomDialog from '@/components/CustomDialog';
import { ThemeProvider } from '@/hooks/useTheme';

const renderDialog = (props: Partial<React.ComponentProps<typeof CustomDialog>> = {}) =>
  render(
    <ThemeProvider>
      <CustomDialog
        visible
        title="Success"
        message="Your data has been saved!"
        type="success"
        buttons={[{ text: 'OK', style: 'primary' }]}
        {...props}
      />
    </ThemeProvider>
  );

describe('CustomDialog', () => {
  it('renders title and message', () => {
    const screen = renderDialog();
    expect(screen.getByText('Success')).toBeTruthy();
    expect(screen.getByText('Your data has been saved!')).toBeTruthy();
  });

  it('fires the button callback and dismisses', () => {
    const onPress = jest.fn();
    const onDismiss = jest.fn();
    const screen = renderDialog({
      buttons: [{ text: 'OK', style: 'primary', onPress }],
      onDismiss,
    });

    fireEvent.press(screen.getByText('OK'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('exposes stable testIDs for automation', () => {
    const screen = renderDialog();
    expect(screen.getByTestId('dialog')).toBeTruthy();
    expect(screen.getByTestId('dialog-title')).toBeTruthy();
    expect(screen.getByTestId('dialog-button-ok')).toBeTruthy();
  });

  it('dismisses before an action opens a follow-up dialog', () => {
    const order: string[] = [];
    const screen = renderDialog({
      onDismiss: () => order.push('dismiss'),
      buttons: [{ text: 'Continue', onPress: () => order.push('next dialog') }],
    });
    fireEvent.press(screen.getByText('Continue'));
    expect(order).toEqual(['dismiss', 'next dialog']);
  });
});
