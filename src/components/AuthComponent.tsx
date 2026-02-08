import { useState, useEffect, useRef } from 'react';
import type { IGunUserInstance } from 'gun/types';
import { Button } from './ui/Button';

interface AuthComponentProps {
  user: IGunUserInstance | null;
  username: string | null;
  onLogout: () => void;
  onLogin?: () => void;
  isAuthenticated?: boolean;
  onOpenSettings?: () => void;
}

export function AuthComponent({
  user,
  username,
  onLogout,
  onLogin,
  isAuthenticated = true,
  onOpenSettings,
}: AuthComponentProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const displayName = !isAuthenticated
    ? 'Guest'
    : username && !username.includes('.')
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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="inline-flex items-center gap-2 rounded-md border border-border-20 bg-primary-10 px-3 py-2 text-sm font-medium text-foreground-90 transition-all hover:bg-primary-20"
        aria-expanded={isDropdownOpen}
        aria-haspopup="true"
      >
        <span>{displayName}</span>
        <span className="text-xs text-muted-foreground">
          {isDropdownOpen ? '▲' : '▼'}
        </span>
      </button>

      {isDropdownOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 min-w-[150px] overflow-hidden rounded-md border border-border-20 bg-card shadow-lg">
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              onOpenSettings?.();
              setIsDropdownOpen(false);
            }}
            className="w-full px-4 py-3 text-left text-sm text-card-foreground transition-colors hover:bg-primary-10"
          >
            ⚙️ Settings
          </Button>
          {isAuthenticated ? (
            <button
              onClick={handleLogout}
              className="w-full border-t border-border-20 px-4 py-3 text-left text-sm text-card-foreground transition-colors hover:bg-primary-10"
            >
              Logout
            </button>
          ) : (
            <button
              onClick={() => {
                onLogin?.();
                setIsDropdownOpen(false);
              }}
              className="w-full border-t border-border-20 px-4 py-3 text-left text-sm text-card-foreground transition-colors hover:bg-primary-10"
            >
              Login
            </button>
          )}
        </div>
      )}
    </div>
  );
}
