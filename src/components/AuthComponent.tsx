import { useState, useEffect, useRef } from 'react';
import type { IGunUserInstance } from 'gun/types';
import { useTheme } from '../providers/ThemeProvider';

interface AuthComponentProps {
  user: IGunUserInstance | null;
  username: string | null;
  onLogout: () => void;
}

export function AuthComponent({
  user,
  username,
  onLogout,
}: AuthComponentProps) {
  const { theme, setTheme } = useTheme();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const displayName =
    username && !username.includes('.')
      ? username
      : user?.is?.pub
        ? user.is.pub.substring(0, 20) + '...'
        : 'User';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isDropdownOpen]);

  const handleLogout = () => {
    setIsDropdownOpen(false);
    onLogout();
  };

  const handleThemeToggle = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
    setIsDropdownOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="inline-flex items-center gap-2 rounded-md border border-primary-500/30 bg-primary-500/10 px-3 py-2 text-sm font-medium text-card-foreground transition-all hover:bg-primary-500/20 hover:border-primary-500/50"
        aria-expanded={isDropdownOpen}
        aria-haspopup="true"
      >
        <span>{displayName}</span>
        <span className="text-xs text-muted-foreground">
          {isDropdownOpen ? '▲' : '▼'}
        </span>
      </button>

      {isDropdownOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 min-w-[150px] overflow-hidden rounded-md border border-border bg-card shadow-lg">
          <button
            onClick={handleThemeToggle}
            className="w-full px-4 py-3 text-left text-sm text-card-foreground transition-colors hover:bg-accent"
          >
            {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
          </button>
          <button
            onClick={handleLogout}
            className="w-full border-t border-border px-4 py-3 text-left text-sm text-card-foreground transition-colors hover:bg-accent"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
