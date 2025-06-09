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
  shadowColor: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  white: string;
  black: string;
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
  shadowColor: '#000000',
  accent: '#4caf50',
  success: '#4caf50',
  warning: '#ff9800',
  error: '#f44336',
  white: '#ffffff',
  black: '#000000',
};

const darkColors: ThemeColors = {
  background: '#121212',
  surface: '#1e1e1e',
  primary: '#e91e63',
  secondary: '#2a2a2a',
  text: '#ffffff',
  textSecondary: '#b3b3b3',
  border: '#333333',
  shadowColor: '#000000',
  accent: '#4caf50',
  success: '#4caf50',
  warning: '#ff9800',
  error: '#f44336',
  white: '#ffffff',
  black: '#000000',
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