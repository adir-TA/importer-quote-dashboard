import React from 'react';

const tagStyles = {
  favorite: 'tag-favorite',
  approved: 'tag-approved',
  pending: 'tag-pending',
  rejected: 'tag-rejected',
  default: 'tag-default'
};

const tagLabels = {
  favorite: '⭐ Favorite',
  approved: '✓ Approved',
  pending: '◐ Pending',
  rejected: '✕ Rejected'
};

function Tag({ type = 'default', label, onClick, active = false, className = '' }) {
  const styleClass = tagStyles[type] || tagStyles.default;
  const displayLabel = label || tagLabels[type] || type;

  return (
    <span
      className={`tag ${styleClass} ${active ? 'active' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {displayLabel}
    </span>
  );
}

// Tag selector component for forms
function TagSelector({ selected = [], onChange, tags = ['favorite', 'approved', 'pending', 'rejected'] }) {
  const handleToggle = (tag) => {
    if (selected.includes(tag)) {
      onChange(selected.filter(t => t !== tag));
    } else {
      onChange([...selected, tag]);
    }
  };

  return (
    <div className="tag-selector">
      {tags.map(tag => (
        <Tag
          key={tag}
          type={tag}
          active={selected.includes(tag)}
          onClick={() => handleToggle(tag)}
        />
      ))}
    </div>
  );
}

export { Tag, TagSelector };
export default Tag;
