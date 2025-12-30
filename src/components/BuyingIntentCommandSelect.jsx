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

// Normalize category name from intent (handle multiple field formats)
function getCategoryName(intent) {
  // Try category as string (primary field based on Products.jsx)
  if (typeof intent.category === 'string' && intent.category.trim()) {
    return intent.category.trim();
  }
  // Try category.name (if category is an object - defensive)
  if (intent.category?.name && typeof intent.category.name === 'string') {
    return intent.category.name.trim();
  }
  // Try alternate field names (defensive)
  if (intent.category_name && typeof intent.category_name === 'string') {
    return intent.category_name.trim();
  }
  if (intent.categoryName && typeof intent.categoryName === 'string') {
    return intent.categoryName.trim();
  }
  // Default to Uncategorized (matching Products.jsx convention)
  return 'Uncategorized';
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
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Load recent intents on mount
  useEffect(() => {
    setRecentIds(getRecentIntents());
  }, []);

  // Calculate dropdown position when opened
  useEffect(() => {
    if (isOpen && containerRef.current) {
      let rafId = null;

      const updatePosition = () => {
        const rect = containerRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const isMobile = viewportWidth < 768;

        let left = rect.left;
        let width = rect.width;

        // On mobile: simplified positioning with padding
        if (isMobile) {
          const padding = 16;
          // Ensure dropdown stays within viewport with padding
          left = Math.max(padding, Math.min(left, viewportWidth - width - padding));
        } else {
          // Desktop: Ensure dropdown doesn't go off right edge
          if (left + width > viewportWidth - 8) {
            left = viewportWidth - width - 8;
          }
        }

        // Always open downward for stability (no upward logic)
        setDropdownPosition({
          top: rect.bottom + 4,
          left,
          width
        });
      };

      // Throttled update for scroll events using RAF
      const handleScrollOrResize = () => {
        if (rafId) {
          cancelAnimationFrame(rafId);
        }
        rafId = requestAnimationFrame(updatePosition);
      };

      updatePosition();

      // Update position on scroll and resize
      window.addEventListener('scroll', handleScrollOrResize, true); // Use capture for all scrolls
      window.addEventListener('resize', handleScrollOrResize);

      return () => {
        if (rafId) {
          cancelAnimationFrame(rafId);
        }
        window.removeEventListener('scroll', handleScrollOrResize, true);
        window.removeEventListener('resize', handleScrollOrResize);
      };
    }
  }, [isOpen]);

  // Focus search input when opened (desktop only - avoid keyboard popup on mobile)
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      // Only auto-focus on desktop to avoid mobile keyboard issues
      const isMobile = window.innerWidth < 768;
      if (!isMobile) {
        searchInputRef.current.focus();
      }
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
          fuzzyMatch(getCategoryName(intent), searchLower)
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
      const cat = getCategoryName(intent);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(intent);
    });

    // Sort categories (alphabetically, but "Uncategorized" always last) and items within
    const sortedGroups = Object.keys(groups)
      .sort((a, b) => {
        // "Uncategorized" always goes last
        if (a === 'Uncategorized') return 1;
        if (b === 'Uncategorized') return -1;
        return a.localeCompare(b);
      })
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

  // Responsive max height for mobile
  const getResponsiveMaxHeight = () => {
    if (typeof window === 'undefined') return maxHeight;
    const viewportHeight = window.innerHeight;
    const isMobile = window.innerWidth < 768;

    if (isMobile) {
      // On mobile, use up to 60% of viewport height
      return Math.min(maxHeight, viewportHeight * 0.6);
    }
    return maxHeight;
  };

  const responsiveMaxHeight = getResponsiveMaxHeight();

  // Dropdown content
  const dropdownContent = (
    <div
      ref={dropdownRef}
      style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
        maxHeight: `${responsiveMaxHeight}px`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        touchAction: 'manipulation',
      }}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => {
        // Allow scrolling inside dropdown, prevent parent scroll
        const target = e.currentTarget;
        const scrollElement = target.querySelector('[style*="overflowY"]');
        if (scrollElement && scrollElement.scrollHeight > scrollElement.clientHeight) {
          // Let the scroll happen inside
          return;
        }
        e.stopPropagation();
      }}
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
        maxHeight: `${responsiveMaxHeight - 80}px`,
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
              // Filter out intents that are already in recent
              const nonRecentIntents = group.intents.filter(i => !recentIntents.find(r => r.id === i.id));

              // Skip this category if all its intents are in recent
              if (nonRecentIntents.length === 0) return null;

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
                  {nonRecentIntents.map((intent, localIdx) => {
                    const globalIdx = startIndex + localIdx;
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
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width,
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
