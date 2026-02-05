import { useState, FormEvent } from 'react';
import { useAuthStore } from '../stores/authStore';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Button } from './ui/Button';

interface RegisterFormProps {
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
}

export function RegisterForm({
  onSuccess,
  onSwitchToLogin,
}: RegisterFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  const { register, isLoading, error, clearError } = useAuthStore();

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!username || username.trim().length === 0) {
      errors.username = 'Username is required';
    } else if (username.trim().length < 3) {
      errors.username = 'Username must be at least 3 characters';
    } else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      errors.username =
        'Username can only contain letters, numbers, and underscores';
    }

    if (!password || password.length === 0) {
      errors.password = 'Password is required';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    if (!confirmPassword || confirmPassword.length === 0) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
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
      await register(username, password);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      console.error('Registration error:', err);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-center text-xl font-semibold text-card-foreground">
        Create Account
      </h2>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-4">
          <Button
            variant="ghost"
            disabled
            className="pointer-events-none opacity-100"
          >
            Creating Account...
          </Button>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <Label htmlFor="register-username">Username</Label>
          <Input
            id="register-username"
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
          <Label htmlFor="register-password">Password</Label>
          <Input
            id="register-password"
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
            autoComplete="new-password"
            error={!!validationErrors.password}
          />
          {validationErrors.password && (
            <p className="mt-1 text-xs text-rose-500">
              {validationErrors.password}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="register-confirm-password">Confirm Password</Label>
          <Input
            id="register-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={e => {
              setConfirmPassword(e.target.value);
              if (validationErrors.confirmPassword) {
                setValidationErrors(prev => {
                  const next = { ...prev };
                  delete next.confirmPassword;
                  return next;
                });
              }
            }}
            disabled={isLoading}
            placeholder="Confirm password"
            autoComplete="new-password"
            error={!!validationErrors.confirmPassword}
          />
          {validationErrors.confirmPassword && (
            <p className="mt-1 text-xs text-rose-500">
              {validationErrors.confirmPassword}
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
          Create Account
        </Button>

        {onSwitchToLogin && (
          <div className="pt-4 text-center border-t border-border-20">
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading}
              >
                Log in
              </button>
            </p>
          </div>
        )}
      </div>
    </form>
  );
}
