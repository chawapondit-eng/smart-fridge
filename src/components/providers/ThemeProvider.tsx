'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ThemeMode } from '@/types/database';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_KEY = 'smart-fridge-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(THEME_KEY) as ThemeMode | null;
      if (saved && ['light', 'dark', 'system'].includes(saved)) {
        return saved;
      }
    }
    return 'system';
  });
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  // Apply theme class ที่ <html>
  useEffect(() => {
    const root = document.documentElement;

    function applyTheme(mode: ThemeMode) {
      if (mode === 'system') {
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.toggle('dark', systemDark);
        setResolvedTheme(systemDark ? 'dark' : 'light');
      } else {
        root.classList.toggle('dark', mode === 'dark');
        setResolvedTheme(mode);
      }
    }

    applyTheme(theme);

    // ฟัง System theme change
    if (theme === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      media.addEventListener('change', handler);
      return () => media.removeEventListener('change', handler);
    }
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
