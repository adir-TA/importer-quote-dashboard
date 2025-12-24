import React, { useState, useRef } from 'react';
import { X, Plus } from 'lucide-react';

export default function TagInput({ selectedTags = [], availableTags = [], onTagsChange, onCreateTag }) {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef(null);

  const filteredSuggestions = availableTags
    .filter(tag =>
      !selectedTags.find(t => t.id === tag.id) &&
      tag.name.toLowerCase().includes(inputValue.toLowerCase())
    )
    .slice(0, 5);

  const handleAddTag = (tag) => {
    if (!selectedTags.find(t => t.id === tag.id)) {
      onTagsChange([...selectedTags, tag]);
    }
    setInputValue('');
    setShowSuggestions(false);
  };

  const handleRemoveTag = (tagId) => {
    onTagsChange(selectedTags.filter(t => t.id !== tagId));
  };

  const handleKeyDown = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = inputValue.trim();

      if (!trimmed) return;

      // Check if tag already exists
      const existing = availableTags.find(t =>
        t.name.toLowerCase() === trimmed.toLowerCase()
      );

      if (existing) {
        handleAddTag(existing);
      } else if (onCreateTag) {
        // Create new tag
        const newTag = await onCreateTag(trimmed);
        if (newTag) {
          handleAddTag(newTag);
        }
      }
    } else if (e.key === 'Backspace' && !inputValue && selectedTags.length > 0) {
      // Remove last tag when backspace on empty input
      onTagsChange(selectedTags.slice(0, -1));
    }
  };

  return (
    <div className="business-cards-tag-input-container">
      <div className="business-cards-tag-input-wrapper">
        {selectedTags.map(tag => (
          <span key={tag.id} className="business-cards-tag">
            {tag.name}
            <button
              type="button"
              onClick={() => handleRemoveTag(tag.id)}
              className="business-cards-tag-remove"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(e.target.value.length > 0);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(inputValue.length > 0)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={selectedTags.length === 0 ? "Type to add tags..." : ""}
          className="business-cards-tag-input"
        />
      </div>

      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="business-cards-tag-suggestions">
          {filteredSuggestions.map(tag => (
            <div
              key={tag.id}
              className="business-cards-tag-suggestion"
              onClick={() => handleAddTag(tag)}
            >
              {tag.name}
            </div>
          ))}
        </div>
      )}

      {showSuggestions && inputValue && filteredSuggestions.length === 0 && (
        <div className="business-cards-tag-suggestions">
          <div
            className="business-cards-tag-suggestion business-cards-tag-create"
            onClick={async () => {
              const trimmed = inputValue.trim();
              if (trimmed && onCreateTag) {
                const newTag = await onCreateTag(trimmed);
                if (newTag) {
                  handleAddTag(newTag);
                }
              }
            }}
          >
            <Plus size={14} />
            Create "{inputValue}"
          </div>
        </div>
      )}
    </div>
  );
}
