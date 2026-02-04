/**
 * Confirm Modal Component
 *
 * Reusable confirmation modal for destructive actions.
 */

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  isDangerous?: boolean;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onClose,
  isDangerous = false,
}: ConfirmModalProps) {
  if (!isOpen) {
    return null;
  }

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div className="confirm-modal-overlay" onClick={onClose}>
      <div
        className={`confirm-modal ${isDangerous ? 'confirm-modal--dangerous' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="confirm-modal-header">
          <h2>{title}</h2>
          <button
            className="confirm-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="confirm-modal-content">
          <div className="confirm-modal-message">{message}</div>
        </div>

        <div className="confirm-modal-footer">
          <button className="confirm-modal-button" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            className={`confirm-modal-button ${isDangerous ? 'confirm-modal-button--danger' : 'primary'}`}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
