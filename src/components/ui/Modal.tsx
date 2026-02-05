interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ isOpen, onClose, children, className }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className={`relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-lg dark:bg-slate-900 ${className || ''}`}
        onClick={e => e.stopPropagation()}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Close modal"
          >
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
