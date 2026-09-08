import React, { useState, useEffect, useRef } from 'react';
import { Edit2, Check, X } from 'lucide-react';

/**
 * Inline editable field for renaming Buying Intents
 * Shows draft badge for draft intents
 * Allows click-to-edit with keyboard support
 */
export function InlineRenameField({
  value,
  onSave,
  isDraft = false,
  autoFinalizeOnEdit = false,
  className = '',
  style = {},
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmedValue = editValue.trim();
    if (trimmedValue && trimmedValue !== value) {
      onSave(trimmedValue);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        ...style
      }} className={className}>
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          style={{
            flex: 1,
            padding: '6px 10px',
            border: '2px solid var(--accent)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-md)',
            outline: 'none',
            fontWeight: 500,
          }}
        />
        <button
          onClick={handleSave}
          style={{
            background: 'var(--success)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-xs)',
            padding: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Save (Enter)"
        >
          <Check size={14} />
        </button>
        <button
          onClick={handleCancel}
          style={{
            background: 'var(--error)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-xs)',
            padding: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Cancel (Esc)"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      cursor: 'pointer',
      padding: '6px 0',
      ...style
    }} className={className}>
      <span
        onClick={() => setIsEditing(true)}
        style={{
          fontWeight: isDraft ? 400 : 500,
          color: isDraft ? 'var(--text-secondary)' : 'var(--text-primary)',
          flex: 1,
        }}
        title={isDraft ? 'Click to rename and finalize' : 'Click to rename'}
      >
        {value}
      </span>

      {isDraft && (
        <span style={{
          display: 'inline-block',
          padding: '2px 8px',
          background: 'var(--warning-light)',
          color: 'var(--warning)',
          borderRadius: 'var(--radius-xs)',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          }}>
          Draft
        </span>
      )}

      <button
        onClick={() => setIsEditing(true)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-subtle)',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          transition: 'color 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-subtle)'}
        title="Rename"
      >
        <Edit2 size={14} />
      </button>
    </div>
  );
}

export default InlineRenameField;
