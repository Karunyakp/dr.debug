import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface ThemeToggleProps {
  showLabel?: boolean;
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  showLabel = false,
  className = '',
}) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-kairos-border bg-kairos-surface text-kairos-forest-ink hover:border-kairos-emerald hover:text-kairos-emerald-ink transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kairos-emerald ${
        showLabel ? 'px-3 py-2 text-xs font-semibold' : 'w-9 h-9'
      } ${className}`}
    >
      {isDark ? (
        <Sun className="w-4 h-4 text-kairos-gold shrink-0" />
      ) : (
        <Moon className="w-4 h-4 text-kairos-forest-ink shrink-0" />
      )}
      {showLabel && <span>{isDark ? 'Light' : 'Dark'}</span>}
    </button>
  );
};
