/**
 * Auth Component
 *
 * Displays authenticated user info with dropdown logout option.
 * Positioned in the top-right of the app header.
 */

import { useState, useEffect, useRef } from 'react'
import type { IGunUserInstance } from 'gun/types'

// GunDB user session state (from gun.user().is)
interface GunUserSession {
  alias?: string
  pub?: string
}

interface AuthComponentProps {
  user: IGunUserInstance | null
  onLogout: () => void
}

export function AuthComponent({ user, onLogout }: AuthComponentProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Get username from user object with fallbacks
  const getUsername = () => {
    if (!user?.is) return 'User'

    const userState = user.is as GunUserSession

    // Prefer alias if it exists and is not a public key
    if (userState.alias && !userState.alias.includes('.')) {
      return userState.alias
    }
    // Fallback to pub key (truncated) if no alias
    if (userState.pub) {
      return userState.pub.substring(0, 20) + '...'
    }

    return 'User'
  }

  const username = getUsername()

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDropdownOpen])

  // Close dropdown on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isDropdownOpen])

  const handleLogout = () => {
    setIsDropdownOpen(false)
    onLogout()
  }

  return (
    <div className="auth-component" ref={dropdownRef}>
      <button
        className="auth-trigger"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        aria-expanded={isDropdownOpen}
        aria-haspopup="true"
      >
        <span>{username}</span>
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
  )
}
