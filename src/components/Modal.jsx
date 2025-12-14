import React from 'react';
import { X, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import '../styles/modal.css';

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
      <div className="modal-overlay" style={{ zIndex }} onClick={onCancel}>
        <div className="modal confirm-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-body">
            <div className={`confirm-icon ${confirmType}`}>
              {iconMap[confirmType] || iconMap.warning}
            </div>
            <h3 className="confirm-title">{title}</h3>
            <p className="confirm-message">{message}</p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={onCancel}>
                {cancelText || 'Cancel'}
              </button>
              <button 
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
      <div className="modal-overlay" style={{ zIndex }} onClick={onClose}>
        <div className="modal confirm-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-body">
            <div className={`confirm-icon ${alertType}`}>
              {iconMap[alertType] || iconMap.success}
            </div>
            <h3 className="confirm-title">{title}</h3>
            <p className="confirm-message">{message}</p>
            <div className="confirm-actions">
              <button className="btn btn-primary" onClick={onClose}>
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
    <div className="modal-overlay" style={{ zIndex }} onClick={onClose}>
      <div className={`modal ${sizeClass}`} onClick={e => e.stopPropagation()}>
        {(title || showCloseButton) && (
          <div className="modal-header">
            <span className="modal-title">{title}</span>
            {showCloseButton && (
              <button className="icon-btn" onClick={onClose}>
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
