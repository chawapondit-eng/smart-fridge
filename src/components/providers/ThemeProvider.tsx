'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ThemeMode } from '@/types/database';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_KEY = 'smart-fridge-theme-v2';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(THEME_KEY) as ThemeMode | null;
      if (saved && ['light', 'dark'].includes(saved)) {
        return saved;
      }
    }
    // Default to Light Theme per UI Reference
    return 'light';
  });
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  // Apply theme class ที่ <html> (Default to Light Theme)
  useEffect(() => {
    const root = document.documentElement;

    function applyTheme(mode: ThemeMode) {
      const isDark = mode === 'dark';
      root.classList.toggle('dark', isDark);
      setResolvedTheme(isDark ? 'dark' : 'light');
    }

    applyTheme(theme);
  }, [theme]);

  function setTheme(newTheme: ThemeMode) {
    setThemeState(newTheme);
    localStorage.setItem(THEME_KEY, newTheme);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme ต้องใช้ภายใน ThemeProvider');
  }
  return context;
}
