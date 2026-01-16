/**
 * Login Form Component
 *
 * Form for user login with validation.
 */

import { useState, FormEvent } from 'react'
import { useAuthStore } from '../stores/authStore'

interface LoginFormProps {
  onSuccess?: () => void
  onSwitchToRegister?: () => void
}

export function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const { login, isLoading, error, clearError } = useAuthStore()

  /**
   * Validate form inputs
   */
  const validate = (): boolean => {
    const errors: Record<string, string> = {}

    // Username validation
    if (!username || username.trim().length === 0) {
      errors.username = 'Username is required'
    }

    // Password validation
    if (!password || password.length === 0) {
      errors.password = 'Password is required'
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
      await login(username, password)
      if (onSuccess) {
        onSuccess()
      }
    } catch (err) {
      // Error is handled by the auth store (shows inline error message)
      // Prevent error from bubbling up to global error handlers
      console.error('Login error:', err)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <h2>Log In</h2>

      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <span>Logging in...</span>
        </div>
      )}

      <div className={isLoading ? 'loading-content' : ''}>
        <div className="form-group">
          <label htmlFor="login-username">Username</label>
          <input
            id="login-username"
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
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
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
            autoComplete="current-password"
          />
          {validationErrors.password && (
            <span className="error-message">{validationErrors.password}</span>
          )}
        </div>

        {error && <div className="error-message global-error">{error}</div>}

        <button type="submit" disabled={isLoading} className="submit-button">
          {isLoading ? (
            <>
              <span className="button-spinner"></span>
              Logging in...
            </>
          ) : (
            'Log In'
          )}
        </button>

        {onSwitchToRegister && (
          <div className="form-footer">
            <p>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={onSwitchToRegister}
                className="link-button"
                disabled={isLoading}
              >
                Create account
              </button>
            </p>
          </div>
        )}
      </div>
    </form>
  )
}
