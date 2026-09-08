import React, { useEffect, useRef, useCallback } from 'react';
import { X, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import '../styles/modal.css';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Shared modal behaviour: Escape to dismiss, focus trapped inside the dialog,
 * focus restored to the trigger on close, and the page behind locked from
 * scrolling. None of this existed before, so keyboard and screen-reader users
 * could not dismiss a modal at all.
 */
function useModalBehaviour(dialogRef, onDismiss) {
  const previouslyFocused = useRef(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog so the first Tab stays inside it
    const node = dialogRef.current;
    if (node) {
      const first = node.querySelector(FOCUSABLE);
      (first || node).focus?.();
    }

    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [dialogRef]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onDismiss?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const node = dialogRef.current;
      if (!node) return;

      const focusable = Array.from(node.querySelectorAll(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [dialogRef, onDismiss]);
}

function Modal({
  type = 'default',
  title,
  message,
  children,
  size = 'default',
  onClose,
  confirmType,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  alertType,
  zIndex = 200,
  showCloseButton = true,
  footer
}) {
  const dialogRef = useRef(null);

  // Escape / backdrop dismissal maps to the most specific handler available.
  const handleDismiss = useCallback(() => {
    if (type === 'confirm') return onCancel?.() ?? onClose?.();
    return onClose?.();
  }, [type, onCancel, onClose]);

  useModalBehaviour(dialogRef, handleDismiss);

  // Only dismiss on a click that starts and ends on the backdrop itself,
  // so a drag that finishes outside a text field does not close the dialog.
  const handleOverlayMouseDown = (event) => {
    if (event.target === event.currentTarget) {
      dialogRef.current?.setAttribute('data-overlay-press', 'true');
    }
  };

  const handleOverlayClick = (event) => {
    const pressed = dialogRef.current?.getAttribute('data-overlay-press') === 'true';
    dialogRef.current?.removeAttribute('data-overlay-press');
    if (pressed && event.target === event.currentTarget) {
      handleDismiss();
    }
  };

  const overlayProps = {
    className: 'modal-overlay',
    style: { zIndex },
    onMouseDown: handleOverlayMouseDown,
    onClick: handleOverlayClick,
  };

  const dialogProps = {
    ref: dialogRef,
    role: type === 'alert' ? 'alertdialog' : 'dialog',
    'aria-modal': 'true',
    'aria-label': title || (type === 'confirm' ? 'Confirmation' : 'Dialog'),
    tabIndex: -1,
  };

  const sizeClass = {
    default: '',
    lg: 'modal-lg',
    xl: 'modal-xl',
    fullscreen: 'modal-fullscreen'
  }[size];

  // Confirmation modal
  if (type === 'confirm') {
    const iconMap = {
      warning: <AlertTriangle size={32} />,
      danger: <AlertCircle size={32} />,
      success: <CheckCircle size={32} />
    };

    return (
      <div {...overlayProps}>
        <div {...dialogProps} className="modal confirm-modal">
          <div className="modal-body">
            <div className={`confirm-icon ${confirmType}`} aria-hidden="true">
              {iconMap[confirmType] || iconMap.warning}
            </div>
            <h3 className="confirm-title">{title}</h3>
            <p className="confirm-message">{message}</p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-secondary" onClick={onCancel}>
                {cancelText || 'Cancel'}
              </button>
              <button
                type="button"
                className={`btn ${confirmType === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                onClick={onConfirm}
              >
                {confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Alert modal
  if (type === 'alert') {
    const iconMap = {
      success: <CheckCircle size={32} />,
      warning: <AlertTriangle size={32} />,
      error: <AlertCircle size={32} />
    };

    return (
      <div {...overlayProps}>
        <div {...dialogProps} className="modal confirm-modal">
          <div className="modal-body">
            <div className={`confirm-icon ${alertType}`} aria-hidden="true">
              {iconMap[alertType] || iconMap.success}
            </div>
            <h3 className="confirm-title">{title}</h3>
            <p className="confirm-message">{message}</p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-primary" onClick={onClose}>
                OK
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default modal
  return (
    <div {...overlayProps}>
      <div {...dialogProps} className={`modal ${sizeClass}`}>
        {(title || showCloseButton) && (
          <div className="modal-header">
            <span className="modal-title">{title}</span>
            {showCloseButton && (
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">
                <X size={20} />
              </button>
            )}
          </div>
        )}
        <div className="modal-body">
          {message && <p>{message}</p>}
          {children}
        </div>
        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default Modal;
