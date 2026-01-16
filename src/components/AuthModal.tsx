/**
 * Auth Modal Component
 *
 * Modal for user authentication with login and registration forms.
 */

import { useState } from 'react'
import { LoginForm } from './LoginForm'
import { RegisterForm } from './RegisterForm'

interface AuthModalProps {
  isOpen: boolean
  onClose?: () => void
  defaultTab?: 'login' | 'register'
  isLoading?: boolean
}

export function AuthModal({
  isOpen,
  onClose,
  defaultTab = 'login',
  isLoading = false,
}: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(defaultTab)

  if (!isOpen) {
    return null
  }

  const handleSuccess = () => {
    // Close modal on successful auth
    if (onClose) {
      onClose()
    }
  }

  const handleOverlayClick = () => {
    // Don't close if loading
    if (!isLoading && onClose) {
      onClose()
    }
  }

  return (
    <div className="auth-modal-overlay" onClick={handleOverlayClick}>
      <div className="auth-modal" onClick={e => e.stopPropagation()}>
        {onClose && (
          <button
            className="auth-modal-close"
            onClick={onClose}
            aria-label="Close"
            disabled={isLoading}
          >
            ×
          </button>
        )}

        <div className="auth-modal-tabs">
          <button
            className={`auth-tab ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => setActiveTab('login')}
            disabled={isLoading}
          >
            Log In
          </button>
          <button
            className={`auth-tab ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => setActiveTab('register')}
            disabled={isLoading}
          >
            Register
          </button>
        </div>

        <div className="auth-modal-content">
          {activeTab === 'login' ? (
            <LoginForm
              onSuccess={handleSuccess}
              onSwitchToRegister={() => setActiveTab('register')}
            />
          ) : (
            <RegisterForm onSuccess={handleSuccess} onSwitchToLogin={() => setActiveTab('login')} />
          )}
        </div>
      </div>
    </div>
  )
}
