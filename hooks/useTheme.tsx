import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ThemeColors {
  background: string;
  surface: string;
  primary: string;
  secondary: string;
  text: string;
  textSecondary: string;
  border: string;
  borderStrong: string;
  shadowColor: string;
  accent: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  error: string;
  teal: string;
  tealSoft: string;
  primarySoft: string;
  primaryWeak: string;
  surfaceTint: string;
  white: string;
  black: string;
  today: string;
  todaySoft: string;
}

interface Theme {
  isDark: boolean;
  colors: ThemeColors;
}

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
}

const lightColors: ThemeColors = {
  background: '#fafafa',
  surface: '#ffffff',
  primary: '#e91e63',
  secondary: '#f5f5f5',
  text: '#333333',
  textSecondary: '#666666',
  border: '#f0f0f0',
  borderStrong: '#e6e6e8',
  shadowColor: '#000000',
  accent: '#4caf50',
  success: '#4caf50',
  successSoft: '#e8f5e9',
  warning: '#ff9800',
  warningSoft: '#fff3e0',
  error: '#f44336',
  teal: '#009688',
  tealSoft: '#e0f2f1',
  primarySoft: '#fce4ec',
  primaryWeak: '#f8bbd0',
  surfaceTint: '#fff8fb',
  white: '#ffffff',
  black: '#000000',
  today: '#0077b6',
  todaySoft: '#e3f2fd',
};

const darkColors: ThemeColors = {
  background: '#121212',
  surface: '#1e1e1e',
  primary: '#e91e63',
  secondary: '#2a2a2a',
  text: '#ffffff',
  textSecondary: '#b3b3b3',
  border: '#333333',
  borderStrong: '#3a3a3a',
  shadowColor: '#000000',
  accent: '#4caf50',
  success: '#4caf50',
  successSoft: '#1f3a24',
  warning: '#ff9800',
  warningSoft: '#3a2a14',
  error: '#f44336',
  teal: '#009688',
  tealSoft: '#183b37',
  primarySoft: '#3b1b28',
  primaryWeak: '#5a2437',
  surfaceTint: '#241a1e',
  white: '#ffffff',
  black: '#000000',
  today: '#4fa8e0',
  todaySoft: '#142a3a',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'theme_preference';

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    loadThemePreference();
  }, []);

  const loadThemePreference = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme !== null) {
        setIsDark(savedTheme === 'dark');
      }
    } catch (error) {
      console.log('Error loading theme preference:', error);
    }
  };

  const toggleTheme = async () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme ? 'dark' : 'light');
    } catch (error) {
      console.log('Error saving theme preference:', error);
    }
  };

  const theme: Theme = {
    isDark,
    colors: isDark ? darkColors : lightColors,
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}; 