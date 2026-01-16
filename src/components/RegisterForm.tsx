/**
 * Register Form Component
 *
 * Form for user registration with validation.
 */

import { useState, FormEvent } from 'react'
import { useAuthStore } from '../stores/authStore'

interface RegisterFormProps {
  onSuccess?: () => void
  onSwitchToLogin?: () => void
}

export function RegisterForm({ onSuccess, onSwitchToLogin }: RegisterFormProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const { register, isLoading, error, clearError } = useAuthStore()

  /**
   * Validate form inputs
   */
  const validate = (): boolean => {
    const errors: Record<string, string> = {}

    // Username validation
    if (!username || username.trim().length === 0) {
      errors.username = 'Username is required'
    } else if (username.trim().length < 3) {
      errors.username = 'Username must be at least 3 characters'
    } else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      errors.username = 'Username can only contain letters, numbers, and underscores'
    }

    // Password validation
    if (!password || password.length === 0) {
      errors.password = 'Password is required'
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters'
    }

    // Confirm password validation
    if (!confirmPassword || confirmPassword.length === 0) {
      errors.confirmPassword = 'Please confirm your password'
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match'
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    clearError()

    if (!validate()) {
      return
    }

    try {
      await register(username, password)
      if (onSuccess) {
        onSuccess()
      }
    } catch (err) {
      // Error is handled by the auth store (shows inline error message)
      // Prevent error from bubbling up to global error handlers
      console.error('Registration error:', err)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="register-form">
      <h2>Create Account</h2>

      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <span>Creating Account...</span>
        </div>
      )}

      <div className={isLoading ? 'loading-content' : ''}>
        <div className="form-group">
          <label htmlFor="register-username">Username</label>
          <input
            id="register-username"
            type="text"
            value={username}
            onChange={e => {
              setUsername(e.target.value)
              if (validationErrors.username) {
                setValidationErrors(prev => {
                  const next = { ...prev }
                  delete next.username
                  return next
                })
              }
            }}
            disabled={isLoading}
            placeholder="Enter username"
            autoComplete="username"
          />
          {validationErrors.username && (
            <span className="error-message">{validationErrors.username}</span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="register-password">Password</label>
          <input
            id="register-password"
            type="password"
            value={password}
            onChange={e => {
              setPassword(e.target.value)
              if (validationErrors.password) {
                setValidationErrors(prev => {
                  const next = { ...prev }
                  delete next.password
                  return next
                })
              }
            }}
            disabled={isLoading}
            placeholder="Enter password"
            autoComplete="new-password"
          />
          {validationErrors.password && (
            <span className="error-message">{validationErrors.password}</span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="register-confirm-password">Confirm Password</label>
          <input
            id="register-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={e => {
              setConfirmPassword(e.target.value)
              if (validationErrors.confirmPassword) {
                setValidationErrors(prev => {
                  const next = { ...prev }
                  delete next.confirmPassword
                  return next
                })
              }
            }}
            disabled={isLoading}
            placeholder="Confirm password"
            autoComplete="new-password"
          />
          {validationErrors.confirmPassword && (
            <span className="error-message">{validationErrors.confirmPassword}</span>
          )}
        </div>

        {error && <div className="error-message global-error">{error}</div>}

        <button type="submit" disabled={isLoading} className="submit-button">
          {isLoading ? (
            <>
              <span className="button-spinner"></span>
              Creating Account...
            </>
          ) : (
            'Create Account'
          )}
        </button>

        {onSwitchToLogin && (
          <div className="form-footer">
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="link-button"
                disabled={isLoading}
              >
                Log in
              </button>
            </p>
          </div>
        )}
      </div>
    </form>
  )
}
