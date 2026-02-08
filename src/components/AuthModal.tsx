import { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { Modal } from './ui/Modal';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  defaultTab?: 'login' | 'register';
  onOpenSettings?: () => void;
}

export function AuthModal({
  isOpen,
  onClose,
  defaultTab = 'login',
  onOpenSettings,
}: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(defaultTab);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const handleSuccess = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between border-b border-border-20">
          <div className="flex gap-2">
            <button
              className={`px-4 pb-3 text-sm font-medium transition-colors ${
                activeTab === 'login'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-foreground-60 hover:text-foreground-90'
              }`}
              onClick={() => setActiveTab('login')}
            >
              Log In
            </button>
            <button
              className={`px-4 pb-3 text-sm font-medium transition-colors ${
                activeTab === 'register'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-foreground-60 hover:text-foreground-90'
              }`}
              onClick={() => setActiveTab('register')}
            >
              Register
            </button>
          </div>
          {onOpenSettings && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenSettings}
              className="text-muted-foreground hover:text-card-foreground"
            >
              ⚙️
            </Button>
          )}
        </div>

        <div>
          {activeTab === 'login' ? (
            <LoginForm
              onSuccess={handleSuccess}
              onSwitchToRegister={() => setActiveTab('register')}
            />
          ) : (
            <RegisterForm
              onSuccess={handleSuccess}
              onSwitchToLogin={() => setActiveTab('login')}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
