import React from 'react';
import { Search } from 'lucide-react';

function SearchInput({ value, onChange, placeholder = 'Search...', className = '' }) {
  return (
    <div className={`search-container ${className}`}>
      <Search size={18} className="search-icon" />
      <input
        type="text"
        className="search-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export default SearchInput;
