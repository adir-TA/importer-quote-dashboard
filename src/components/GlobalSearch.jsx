import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, File, Package, FileText, Building2, X, FolderOpen } from 'lucide-react';
import { useGlobalSearch } from '../hooks/useGlobalSearch';
import '../styles/global-search.css';

export default function GlobalSearch({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const resultsRef = useRef(null);
  const navigate = useNavigate();

  const results = useGlobalSearch(query);

  // Flatten results for keyboard navigation
  const flatResults = [
    ...results.suppliers.map(r => ({ ...r, group: 'Suppliers' })),
    ...results.products.map(r => ({ ...r, group: 'Buying Intents' })),
    ...results.buyingIntentCategories.map(r => ({ ...r, group: 'Buying Intent Categories' })),
    ...results.quotes.map(r => ({ ...r, group: 'Quotes' })),
    ...results.documents.map(r => ({ ...r, group: 'Documents' }))
  ];

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        setSelectedIndex(prev => Math.min(prev + 1, flatResults.length - 1));
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        e.preventDefault();
      } else if (e.key === 'Enter' && flatResults.length > 0) {
        handleSelect(flatResults[selectedIndex]);
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, flatResults, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && selectedIndex >= 0) {
      const selectedElement = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  const handleSelect = (result) => {
    if (!result) return;

    // Navigate based on entity type
    switch (result.type) {
      case 'supplier':
        navigate('/suppliers');
        break;
      case 'product':
        navigate(`/products/${result.id}`);
        break;
      case 'buyingIntentCategory':
        // Navigate to Products page filtered by this category
        navigate(`/products?category=${encodeURIComponent(result.id)}`);
        break;
      case 'quote':
        // Navigate to comparison with this quote's product
        if (result.data.product_id) {
          navigate(`/products/${result.data.product_id}`);
        } else {
          navigate('/comparison');
        }
        break;
      case 'document':
        navigate('/documents');
        break;
      default:
        break;
    }

    onClose();
  };

  const getIcon = (type) => {
    switch (type) {
      case 'supplier':
        return <Building2 size={16} />;
      case 'product':
        return <Package size={16} />;
      case 'buyingIntentCategory':
        return <FolderOpen size={16} />;
      case 'quote':
        return <FileText size={16} />;
      case 'document':
        return <File size={16} />;
      default:
        return <Search size={16} />;
    }
  };

  const highlightMatch = (text, query) => {
    if (!text || !query) return text;

    const index = text.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return text;

    return (
      <>
        {text.substring(0, index)}
        <mark className="search-highlight">{text.substring(index, index + query.length)}</mark>
        {text.substring(index + query.length)}
      </>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="global-search-overlay" onClick={onClose}>
      <div className="global-search-container" onClick={(e) => e.stopPropagation()}>
        {/* Search Input */}
        <div className="global-search-input-wrapper">
          <Search size={20} className="search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="global-search-input"
            placeholder="Search suppliers, products, quotes, documents..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck="false"
          />
          <button
            className="search-close-btn"
            onClick={onClose}
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Results */}
        <div className="global-search-results" ref={resultsRef}>
          {query.trim().length === 0 ? (
            <div className="search-empty-state">
              <Search size={48} style={{ opacity: 0.3 }} />
              <p>Type to search across all entities</p>
              <div className="search-hints">
                <span>Suppliers</span>
                <span>•</span>
                <span>Buying Intents</span>
                <span>•</span>
                <span>Quotes</span>
                <span>•</span>
                <span>Documents</span>
              </div>
            </div>
          ) : results.total === 0 ? (
            <div className="search-empty-state">
              <Search size={48} style={{ opacity: 0.3 }} />
              <p>No results found for "{query}"</p>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Try a different search term
              </span>
            </div>
          ) : (
            <>
              {/* Suppliers */}
              {results.suppliers.length > 0 && (
                <div className="search-result-group">
                  <div className="search-result-group-header">
                    <Building2 size={14} />
                    Suppliers
                    <span className="result-count">{results.suppliers.length}</span>
                  </div>
                  {results.suppliers.map((result, index) => {
                    const globalIndex = flatResults.findIndex(r => r.type === result.type && r.id === result.id);
                    return (
                      <button
                        key={`supplier-${result.id}`}
                        data-index={globalIndex}
                        className={`search-result-item ${globalIndex === selectedIndex ? 'selected' : ''}`}
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                      >
                        <div className="result-icon">{getIcon(result.type)}</div>
                        <div className="result-content">
                          <div className="result-title">{highlightMatch(result.title, query)}</div>
                          <div className="result-subtitle">{result.subtitle}</div>
                        </div>
                        {result.metadata && (
                          <div className="result-metadata">{result.metadata}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Buying Intents (Products) */}
              {results.products.length > 0 && (
                <div className="search-result-group">
                  <div className="search-result-group-header">
                    <Package size={14} />
                    Buying Intents
                    <span className="result-count">{results.products.length}</span>
                  </div>
                  {results.products.map((result) => {
                    const globalIndex = flatResults.findIndex(r => r.type === result.type && r.id === result.id);
                    const hasImage = result.data?.image_url;

                    return (
                      <button
                        key={`product-${result.id}`}
                        data-index={globalIndex}
                        className={`search-result-item ${globalIndex === selectedIndex ? 'selected' : ''}`}
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                      >
                        {hasImage ? (
                          <div className="result-icon result-image">
                            <img
                              src={result.data.image_url}
                              alt={result.title}
                              onError={(e) => {
                                // Fallback to icon if image fails to load
                                e.target.style.display = 'none';
                                e.target.nextElementSibling.style.display = 'flex';
                              }}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                borderRadius: 'var(--radius-md)',
                              }}
                            />
                            <div style={{ display: 'none' }}>
                              {getIcon(result.type)}
                            </div>
                          </div>
                        ) : (
                          <div className="result-icon">{getIcon(result.type)}</div>
                        )}
                        <div className="result-content">
                          <div className="result-title">{highlightMatch(result.title, query)}</div>
                          <div className="result-subtitle">{result.subtitle}</div>
                        </div>
                        {result.metadata && (
                          <div className="result-metadata">{result.metadata}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Buying Intent Categories */}
              {results.buyingIntentCategories.length > 0 && (
                <div className="search-result-group">
                  <div className="search-result-group-header">
                    <FolderOpen size={14} />
                    Buying Intent Categories
                    <span className="result-count">{results.buyingIntentCategories.length}</span>
                  </div>
                  {results.buyingIntentCategories.map((result) => {
                    const globalIndex = flatResults.findIndex(r => r.type === result.type && r.id === result.id);
                    return (
                      <button
                        key={`buying-intent-category-${result.id}`}
                        data-index={globalIndex}
                        className={`search-result-item ${globalIndex === selectedIndex ? 'selected' : ''}`}
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                      >
                        <div className="result-icon">{getIcon(result.type)}</div>
                        <div className="result-content">
                          <div className="result-title">{highlightMatch(result.title, query)}</div>
                          <div className="result-subtitle">{result.subtitle}</div>
                        </div>
                        {result.metadata && (
                          <div className="result-metadata">{result.metadata}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Quotes */}
              {results.quotes.length > 0 && (
                <div className="search-result-group">
                  <div className="search-result-group-header">
                    <FileText size={14} />
                    Quotes
                    <span className="result-count">{results.quotes.length}</span>
                  </div>
                  {results.quotes.map((result) => {
                    const globalIndex = flatResults.findIndex(r => r.type === result.type && r.id === result.id);
                    return (
                      <button
                        key={`quote-${result.id}`}
                        data-index={globalIndex}
                        className={`search-result-item ${globalIndex === selectedIndex ? 'selected' : ''}`}
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                      >
                        <div className="result-icon">{getIcon(result.type)}</div>
                        <div className="result-content">
                          <div className="result-title">{highlightMatch(result.title, query)}</div>
                          <div className="result-subtitle">{result.subtitle}</div>
                        </div>
                        {result.metadata && (
                          <div className="result-metadata">{result.metadata}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Documents */}
              {results.documents.length > 0 && (
                <div className="search-result-group">
                  <div className="search-result-group-header">
                    <File size={14} />
                    Documents
                    <span className="result-count">{results.documents.length}</span>
                  </div>
                  {results.documents.map((result) => {
                    const globalIndex = flatResults.findIndex(r => r.type === result.type && r.id === result.id);
                    return (
                      <button
                        key={`document-${result.id}`}
                        data-index={globalIndex}
                        className={`search-result-item ${globalIndex === selectedIndex ? 'selected' : ''}`}
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                      >
                        <div className="result-icon">{getIcon(result.type)}</div>
                        <div className="result-content">
                          <div className="result-title">{highlightMatch(result.title, query)}</div>
                          <div className="result-subtitle">{result.subtitle}</div>
                        </div>
                        {result.metadata && (
                          <div className="result-metadata">{result.metadata}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

            </>
          )}
        </div>

        {/* Footer */}
        <div className="global-search-footer">
          <div className="search-shortcuts">
            <kbd>↑↓</kbd> Navigate
            <kbd>Enter</kbd> Select
            <kbd>Esc</kbd> Close
          </div>
          <div className="search-result-count">
            {results.total > 0 && `${results.total} result${results.total === 1 ? '' : 's'}`}
          </div>
        </div>
      </div>
    </div>
  );
}
