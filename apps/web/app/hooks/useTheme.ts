'use client';

import { useEffect, useState } from 'react';
import { THEME_STORAGE_KEY } from '../constants';

export function useTheme() {
  const [darkMode, setDarkMode] = useState(false);
  const [themeLoaded, setThemeLoaded] = useState(false);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(storedTheme ? storedTheme === 'dark' : prefersDark);
    setThemeLoaded(true);
  }, []);

  useEffect(() => {
    if (!themeLoaded) return;

    document.documentElement.classList.toggle('dark', darkMode);
    window.localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
  }, [darkMode, themeLoaded]);

  const toggleDarkMode = () => setDarkMode((prev) => !prev);

  return {
    darkMode,
    themeLoaded,
    toggleDarkMode,
    setDarkMode,
  };
}
