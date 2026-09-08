import React from 'react';
import { FileDown } from 'lucide-react';
import Modal from './Modal';

/**
 * Export theme picker.
 *
 * The RFQ export and the buying-intents export each carried their own
 * hand-rolled copy of this dialog: a fixed overlay with inline styles, no
 * Escape key, no focus trap and no backdrop dismissal. They are one component
 * now, on the same Modal every other dialog in the app uses.
 */
function ThemeSelectorModal({
  open,
  title,
  subtitle,
  themes,
  value,
  onChange,
  onClose,
  onConfirm,
  confirmLabel,
  summaryTitle,
  summaryLines = [],
}) {
  if (!open) return null;

  const selected = themes[value];

  return (
    <Modal
      size="xl"
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            <FileDown size={16} />
            {confirmLabel || `Export with ${selected?.name || ''}`}
          </button>
        </>
      }
    >
      {subtitle && <p className="theme-picker-hint">{subtitle}</p>}

      <div className="theme-picker">
        <div className="theme-picker-list" role="radiogroup" aria-label={title}>
          {Object.entries(themes).map(([key, theme]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={value === key}
              className={`theme-option ${value === key ? 'selected' : ''}`}
              onClick={() => onChange(key)}
            >
              <span className="theme-radio" aria-hidden="true" />
              <span className="theme-option-body">
                <span className="theme-option-name">{theme.name}</span>
                <span className="theme-option-desc">{theme.description}</span>
                <span className="theme-swatches">
                  {theme.preview.map((color, i) => (
                    <span key={i} className="theme-swatch" style={{ background: color }} />
                  ))}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="theme-picker-preview">
          <FileDown size={40} aria-hidden="true" />
          <div className="theme-picker-preview-title">{summaryTitle}</div>
          {summaryLines.filter(Boolean).map((line, i) => (
            <div key={i} className="theme-picker-preview-line">{line}</div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export default ThemeSelectorModal;
