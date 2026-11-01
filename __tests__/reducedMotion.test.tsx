import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';

describe('reduced motion preference', () => {
  afterEach(() => jest.restoreAllMocks());

  it('stays still during loading and responds to live changes', async () => {
    let change: (value: boolean) => void = () => {};
    const remove = jest.fn();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, listener) => {
      change = listener as (value: boolean) => void;
      return { remove };
    });
    const hook = renderHook(() => useReducedMotion());
    expect(hook.result.current).toBe(true);
    await waitFor(() => expect(hook.result.current).toBe(false));
    act(() => change(true));
    expect(hook.result.current).toBe(true);
    hook.unmount();
    expect(remove).toHaveBeenCalled();
  });

  it('does not overwrite a live preference with a stale initial read', async () => {
    let resolve!: (value: boolean) => void;
    let change!: (value: boolean) => void;
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(new Promise(done => { resolve = done; }));
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, listener) => {
      change = listener as (value: boolean) => void;
      return { remove: jest.fn() };
    });
    const hook = renderHook(() => useReducedMotion());
    act(() => change(true));
    await act(async () => resolve(false));
    expect(hook.result.current).toBe(true);
  });
});
