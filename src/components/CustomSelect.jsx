import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * CustomSelect - Unified dropdown component matching Atlassian design system
 * Drop-in replacement for native <select> elements with consistent styling
 */
export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  className = '',
  style = {},
  disabled = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div
      className={`product-selector ${className}`}
      ref={dropdownRef}
      style={{ maxWidth: '100%', ...style }}
    >
      <button
        className="product-selector-trigger"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        type="button"
        disabled={disabled}
        style={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
      >
        <span className="trigger-text" style={{ flex: 1 }}>
          {selectedOption ? (
            <span style={{ color: 'var(--text-primary)' }}>{selectedOption.label}</span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>{placeholder}</span>
          )}
        </span>
        <ChevronDown size={18} className={`trigger-chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="product-selector-dropdown">
          <div className="product-selector-options">
            {options.length === 0 ? (
              <div className="product-selector-empty">No options available</div>
            ) : (
              options.map(option => (
                <button
                  key={option.value}
                  className={`product-option ${option.value === value ? 'selected' : ''}`}
                  onClick={() => handleSelect(option.value)}
                  type="button"
                >
                  <span className="option-name">{option.label}</span>
                  {option.value === value && <Check size={16} className="option-check" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
