import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogStackEntry {
  dialog: HTMLDivElement;
  previouslyFocused: Element | null;
  onClose?: () => void;
}

const dialogStack: DialogStackEntry[] = [];

function isTopmost(dialog: HTMLDivElement): boolean {
  return (
    dialogStack.length > 0 &&
    dialogStack[dialogStack.length - 1].dialog === dialog
  );
}

function getVisibleFocusables(dialog: HTMLDivElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter(el => el.offsetParent !== null || el === document.activeElement);
}

function handleTab(dialog: HTMLDivElement, e: KeyboardEvent): void {
  const focusables = getVisibleFocusables(dialog);
  if (focusables.length === 0) {
    dialog.focus();
    return;
  }

  const active = document.activeElement;
  const index = active instanceof HTMLElement ? focusables.indexOf(active) : -1;

  const nextIndex = e.shiftKey
    ? index <= 0
      ? focusables.length - 1
      : index - 1
    : index === -1 || index === focusables.length - 1
      ? 0
      : index + 1;

  focusables[nextIndex].focus();
}

function handleEscape(dialog: HTMLDivElement): void {
  const entry = dialogStack.find(e => e.dialog === dialog);
  if (entry?.onClose) {
    entry.onClose();
  }
}

export function Modal({ isOpen, onClose, children, className }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;

    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement;

    dialogStack.push({
      dialog,
      previouslyFocused,
      onClose: () => onCloseRef.current?.(),
    });

    if (!dialog.contains(document.activeElement)) {
      dialog.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTopmost(dialog)) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        handleTab(dialog, e);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleEscape(dialog);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const index = dialogStack.findIndex(e => e.dialog === dialog);
      if (index >= 0) {
        dialogStack.splice(index, 1);
      }
      if (
        previouslyFocused instanceof HTMLElement &&
        previouslyFocused.isConnected
      ) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`relative max-h-[90vh] w-full overflow-y-auto rounded-lg bg-card shadow-lg outline-none ${className || ''}`}
        onClick={e => e.stopPropagation()}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-card-foreground"
            aria-label="Close modal"
          >
            ×
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
