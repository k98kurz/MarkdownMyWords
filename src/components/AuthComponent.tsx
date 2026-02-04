/**
 * Auth Component
 *
 * Displays authenticated user info with dropdown logout option.
 * Positioned in the top-right of the app header.
 */

import { useState, useEffect, useRef } from 'react';
import type { IGunUserInstance } from 'gun/types';

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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const displayName =
    username && !username.includes('.')
      ? username
      : user?.is?.pub
        ? user.is.pub.substring(0, 20) + '...'
        : 'User';

  // Close dropdown when clicking outside
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

  // Close dropdown on Escape key
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
    <div className="auth-component" ref={dropdownRef}>
      <button
        className="auth-trigger"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        aria-expanded={isDropdownOpen}
        aria-haspopup="true"
      >
        <span>{displayName}</span>
        <span className="dropdown-arrow">{isDropdownOpen ? '▲' : '▼'}</span>
      </button>

      {isDropdownOpen && (
        <div className="auth-dropdown">
          <button className="dropdown-item" onClick={handleLogout}>
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
