'use client';

import { Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到暗色模式'}
    >
      <Sun
        className={`h-4 w-4 transition-transform ${theme === 'dark' ? 'scale-100 rotate-0' : 'scale-0 rotate-90'}`}
      />
      <Moon
        className={`absolute h-4 w-4 transition-transform ${theme === 'dark' ? 'scale-0 -rotate-90' : 'scale-100 rotate-0'}`}
      />
    </button>
  );
}
