import { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

interface PasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
  error?: string;
}

export function PasswordModal({
  isOpen,
  onClose,
  onSubmit,
  error,
}: PasswordModalProps) {
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(password);
    setPassword('');
  };

  const handleClose = () => {
    setPassword('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} className="max-w-md">
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-4 text-card-foreground">
          Password/key Required
        </h2>
        <p className="text-muted-foreground mb-4">
          Enter a password or key to decrypt this document.
        </p>

        <form onSubmit={handleSubmit}>
          <Input
            type="text"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter password or key"
            autoFocus
          />

          {error && <p className="text-rose-500 mt-2 text-sm">{error}</p>}

          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Decrypt
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
