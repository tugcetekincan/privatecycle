import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import MoodPicker from '@/components/MoodPicker';
import { ThemeProvider } from '@/hooks/useTheme';

const renderPicker = (props: Partial<React.ComponentProps<typeof MoodPicker>> = {}) =>
  render(
    <ThemeProvider>
      <MoodPicker valence={0} tags={[]} onChange={jest.fn()} {...props} />
    </ThemeProvider>
  );

describe('MoodPicker', () => {
  it('renders section headings as literal uppercase (no locale casing)', () => {
    const screen = renderPicker();
    // Literal strings, not textTransform: Android uppercases with the device
    // locale, which turns "i" into dotted İ on Turkish devices.
    expect(screen.getByText('THE DAY, OVERALL')).toBeTruthy();
    expect(screen.getByText('FEELINGS — TAP AGAIN FOR STRENGTH')).toBeTruthy();
  });

  it('adds a feeling at level 1 on first tap', () => {
    const onChange = jest.fn();
    const screen = renderPicker({ onChange });

    fireEvent.press(screen.getByTestId('mood-tag-calm'));

    expect(onChange).toHaveBeenCalledWith({ valence: 0, tags: [{ id: 'calm', level: 1 }] });
  });

  it('clears the overall face when the selected one is tapped again', () => {
    const onChange = jest.fn();
    const screen = renderPicker({ valence: 4, onChange });

    fireEvent.press(screen.getByTestId('mood-valence-4'));

    expect(onChange).toHaveBeenCalledWith({ valence: 0, tags: [] });
  });

  it('honours the testID prefix and shows the saved pill', () => {
    const screen = renderPicker({ testIDPrefix: 'day-modal-mood', saved: true });

    expect(screen.getByTestId('day-modal-mood-valence-3')).toBeTruthy();
    expect(screen.getByTestId('day-modal-mood-tag-anxious')).toBeTruthy();
    expect(screen.getByTestId('day-modal-mood-saved')).toBeTruthy();
  });
});
