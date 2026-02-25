import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn';

/* ------------------------------------------------------------------ */
/*  Context                                                           */
/* ------------------------------------------------------------------ */

interface ModalContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

function useModalContext() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('Modal compound components must be used within <Modal>');
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Modal (root)                                                      */
/* ------------------------------------------------------------------ */

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

function Modal({ open, onOpenChange, children }: ModalProps) {
  return <ModalContext.Provider value={{ open, onOpenChange }}>{children}</ModalContext.Provider>;
}

/* ------------------------------------------------------------------ */
/*  ModalContent                                                      */
/* ------------------------------------------------------------------ */

interface ModalContentProps {
  children: ReactNode;
  className?: string;
}

function ModalContent({ children, className }: ModalContentProps) {
  const { open, onOpenChange } = useModalContext();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  /* body scroll lock */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* escape key */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, close]);

  /* focus trap + restore */
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Delay to let the panel mount
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'input, button, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length > 0) focusable[0]?.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  /* tab cycling */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'input, button, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  if (!open) return null;

  return createPortal(
    /* backdrop — 100% inline styles for positioning */
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="presentation"
    >
      {/* panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        style={{ position: 'relative', margin: '1rem', maxHeight: '90vh', overflowY: 'auto' }}
        className={cn(
          'w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-2xl',
          className,
        )}
      >
        {children}
        {/* close button */}
        <button
          type="button"
          onClick={close}
          style={{ position: 'absolute', right: '1rem', top: '1rem' }}
          className="rounded-sm opacity-70 transition-opacity hover:opacity-100"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
          <span className="sr-only">Close</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function ModalHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)}
      {...props}
    />
  );
}

function ModalFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
      {...props}
    />
  );
}

function ModalTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
  );
}

function ModalClose({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { onOpenChange } = useModalContext();
  return (
    <button type="button" onClick={() => onOpenChange(false)} className={className} {...props} />
  );
}

export { Modal, ModalContent, ModalHeader, ModalFooter, ModalTitle, ModalClose };
