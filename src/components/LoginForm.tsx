import { useState, FormEvent } from 'react';
import { useAuthStore } from '../stores/authStore';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';

interface LoginFormProps {
  onSuccess?: () => void;
  onSwitchToRegister?: () => void;
}

export function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  const { login, isLoading, error, clearError } = useAuthStore();

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!username || username.trim().length === 0) {
      errors.username = 'Username is required';
    }

    if (!password || password.length === 0) {
      errors.password = 'Password is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();

    if (!validate()) {
      return;
    }

    try {
      await login(username, password);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      console.error('Login error:', err);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-center text-xl font-semibold text-card-foreground">
        Log In
      </h2>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-4">
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Logging in...</span>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <Label htmlFor="login-username">Username</Label>
          <Input
            id="login-username"
            type="text"
            value={username}
            onChange={e => {
              setUsername(e.target.value);
              if (validationErrors.username) {
                setValidationErrors(prev => {
                  const next = { ...prev };
                  delete next.username;
                  return next;
                });
              }
            }}
            disabled={isLoading}
            placeholder="Enter username"
            autoComplete="username"
            error={!!validationErrors.username}
          />
          {validationErrors.username && (
            <p className="mt-1 text-xs text-rose-500">
              {validationErrors.username}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            type="password"
            value={password}
            onChange={e => {
              setPassword(e.target.value);
              if (validationErrors.password) {
                setValidationErrors(prev => {
                  const next = { ...prev };
                  delete next.password;
                  return next;
                });
              }
            }}
            disabled={isLoading}
            placeholder="Enter password"
            autoComplete="current-password"
            error={!!validationErrors.password}
          />
          {validationErrors.password && (
            <p className="mt-1 text-xs text-rose-500">
              {validationErrors.password}
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-rose-500/10 p-3 text-center text-sm text-rose-500 border border-rose-500/20">
            {error}
          </div>
        )}

        <Button
          type="submit"
          disabled={isLoading}
          className="w-full"
          isLoading={isLoading}
        >
          Log In
        </Button>

        {onSwitchToRegister && (
          <div className="pt-4 text-center border-t border-border-20">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={onSwitchToRegister}
                className="font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading}
              >
                Create account
              </button>
            </p>
          </div>
        )}
      </div>
    </form>
  );
}
