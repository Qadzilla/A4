import { useUIStore } from '@/stores/ui-store';
import { useEffect } from 'react';
import { useMediaQuery } from './useMediaQuery';

export function useTheme() {
  const { theme, setTheme } = useUIStore();
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');

  const resolvedTheme = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  return { theme, resolvedTheme, setTheme };
}
