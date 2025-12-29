import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Search, Package, ChevronDown, Clock } from 'lucide-react';

const RECENT_INTENTS_KEY = 'recentBuyingIntents';
const MAX_RECENT = 5;

// Get recent buying intents from localStorage
function getRecentIntents() {
  try {
    const stored = localStorage.getItem(RECENT_INTENTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Save recent buying intent to localStorage
function saveRecentIntent(intentId) {
  try {
    const recent = getRecentIntents();
    // Remove if already exists
    const filtered = recent.filter(id => id !== intentId);
    // Add to front
    const updated = [intentId, ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_INTENTS_KEY, JSON.stringify(updated));
  } catch {
    // Fail silently
  }
}

// Simple fuzzy search
function fuzzyMatch(text, search) {
  const searchLower = search.toLowerCase();
  const textLower = text.toLowerCase();

  // Direct substring match
  if (textLower.includes(searchLower)) return true;

  // Fuzzy match: all search chars must appear in order
  let searchIndex = 0;
  for (let i = 0; i < textLower.length && searchIndex < searchLower.length; i++) {
    if (textLower[i] === searchLower[searchIndex]) {
      searchIndex++;
    }
  }
  return searchIndex === searchLower.length;
}

function BuyingIntentCommandSelect({
  buyingIntents,
  value,
  onChange,
  placeholder = 'Select a buying intent...',
  disabled = false,
  maxHeight = 360,
  quoteCounts = {}, // { [intentId]: count }
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentIds, setRecentIds] = useState([]);

  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Load recent intents on mount
  useEffect(() => {
    setRecentIds(getRecentIntents());
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      // Check if click is outside BOTH the trigger button AND the dropdown content
      const isOutsideTrigger = containerRef.current && !containerRef.current.contains(e.target);
      const isOutsideDropdown = dropdownRef.current && !dropdownRef.current.contains(e.target);

      if (isOutsideTrigger && isOutsideDropdown) {
        setIsOpen(false);
        setSearch('');
        setSelectedIndex(0);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Get selected buying intent
  const selectedIntent = buyingIntents.find(intent => intent.id === value);

  // Filter and group buying intents
  const { recentIntents, groupedIntents, flatList } = useMemo(() => {
    // Filter by search
    const searchLower = search.toLowerCase().trim();
    const filtered = searchLower
      ? buyingIntents.filter(intent =>
          fuzzyMatch(intent.name, searchLower) ||
          fuzzyMatch(intent.category || '', searchLower)
        )
      : buyingIntents;

    // Recent intents (only those that exist and match search)
    const recent = recentIds
      .map(id => filtered.find(intent => intent.id === id))
      .filter(Boolean)
      .slice(0, MAX_RECENT);

    // Group by category
    const groups = {};
    filtered.forEach(intent => {
      const cat = intent.category || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(intent);
    });

    // Sort categories and items within
    const sortedGroups = Object.keys(groups)
      .sort((a, b) => a.localeCompare(b))
      .map(category => ({
        category,
        intents: groups[category].sort((a, b) => a.name.localeCompare(b.name))
      }));

    // Flatten for keyboard navigation
    const flat = [];
    if (recent.length > 0) {
      recent.forEach(intent => flat.push(intent));
    }
    sortedGroups.forEach(group => {
      group.intents.forEach(intent => {
        // Don't duplicate if already in recent
        if (!recent.find(r => r.id === intent.id)) {
          flat.push(intent);
        }
      });
    });

    return {
      recentIntents: recent,
      groupedIntents: sortedGroups,
      flatList: flat
    };
  }, [buyingIntents, search, recentIds]);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, flatList.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatList[selectedIndex]) {
          handleSelect(flatList[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearch('');
        setSelectedIndex(0);
        break;
      default:
        break;
    }
  };

  // Handle selection
  const handleSelect = (intent) => {
    onChange(intent.id);
    saveRecentIntent(intent.id);
    setRecentIds(getRecentIntents()); // Refresh recent list
    setIsOpen(false);
    setSearch('');
    setSelectedIndex(0);
  };

  // Scroll selected item into view
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const selectedEl = dropdownRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, isOpen]);

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Render intent row
  const renderIntentRow = (intent, index) => {
    const quoteCount = quoteCounts[intent.id] || 0;
    const hasQuotes = quoteCount > 0;
    const isSelected = index === selectedIndex;
    const isActive = intent.id === value;

    return (
      <div
        key={intent.id}
        data-index={index}
        onClick={() => handleSelect(intent)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 12px',
          cursor: 'pointer',
          background: isSelected ? '#eff6ff' : (isActive ? '#f0fdf4' : 'transparent'),
          borderLeft: isActive ? '3px solid #10b981' : '3px solid transparent',
          transition: 'all 0.1s',
        }}
        onMouseEnter={() => setSelectedIndex(index)}
      >
        <Package size={16} style={{ color: '#94a3b8', flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#1e293b',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {intent.name}
          </div>
        </div>

        <div style={{
          padding: '2px 8px',
          background: hasQuotes ? '#d1fae5' : '#fee2e2',
          color: hasQuotes ? '#065f46' : '#991b1b',
          borderRadius: '4px',
          fontSize: '0.7rem',
          fontWeight: 600,
          flexShrink: 0,
        }}>
          {quoteCount}
        </div>
      </div>
    );
  };

  // Dropdown content
  const dropdownContent = (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        marginTop: '4px',
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
        zIndex: 9999,
        maxHeight: `${maxHeight}px`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search input */}
      <div style={{
        padding: '12px',
        borderBottom: '1px solid #e2e8f0',
        background: '#f8fafc',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: 'white',
          border: '1px solid #cbd5e1',
          borderRadius: '6px',
        }}>
          <Search size={16} style={{ color: '#94a3b8' }} />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by name or category..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '0.875rem',
              color: '#1e293b',
              background: 'transparent',
            }}
          />
        </div>
      </div>

      {/* Results */}
      <div style={{
        overflowY: 'auto',
        maxHeight: `${maxHeight - 80}px`,
      }}>
        {flatList.length === 0 ? (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: '#94a3b8',
            fontSize: '0.875rem',
          }}>
            No buying intents found
          </div>
        ) : (
          <>
            {/* Recent section */}
            {recentIntents.length > 0 && (
              <div>
                <div style={{
                  padding: '8px 12px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: '#64748b',
                  background: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  <Clock size={12} />
                  Recent
                </div>
                {recentIntents.map((intent, idx) => renderIntentRow(intent, idx))}
              </div>
            )}

            {/* Grouped by category */}
            {groupedIntents.map(group => {
              const startIndex = recentIntents.length +
                groupedIntents
                  .slice(0, groupedIntents.indexOf(group))
                  .reduce((sum, g) => sum + g.intents.filter(i => !recentIntents.find(r => r.id === i.id)).length, 0);

              return (
                <div key={group.category}>
                  <div style={{
                    padding: '8px 12px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: '#64748b',
                    background: '#f8fafc',
                  }}>
                    {group.category}
                  </div>
                  {group.intents.map((intent, localIdx) => {
                    // Skip if already in recent
                    if (recentIntents.find(r => r.id === intent.id)) return null;

                    const globalIdx = startIndex + group.intents.slice(0, localIdx).filter(i => !recentIntents.find(r => r.id === i.id)).length;
                    return renderIntentRow(intent, globalIdx);
                  })}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%' }}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger button */}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '12px 16px',
          background: 'white',
          border: '2px solid #e2e8f0',
          borderRadius: '8px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.875rem',
          color: selectedIntent ? '#1e293b' : '#94a3b8',
          opacity: disabled ? 0.5 : 1,
          transition: 'all 0.2s',
        }}
      >
        <Package size={18} style={{ color: '#94a3b8' }} />
        <span style={{ flex: 1, textAlign: 'left' }}>
          {selectedIntent ? selectedIntent.name : placeholder}
        </span>
        <ChevronDown
          size={18}
          style={{
            color: '#94a3b8',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.2s',
          }}
        />
      </button>

      {/* Dropdown (portal) */}
      {isOpen && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            top: containerRef.current?.getBoundingClientRect().bottom + window.scrollY,
            left: containerRef.current?.getBoundingClientRect().left + window.scrollX,
            width: containerRef.current?.offsetWidth,
            zIndex: 9999,
          }}
        >
          {dropdownContent}
        </div>,
        document.body
      )}
    </div>
  );
}

export default BuyingIntentCommandSelect;
