import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  ArrowLeft, FileSpreadsheet, FileText, Sparkles, 
  TrendingDown, MessageSquare, Trophy, X, Check, CheckCircle2,
  FileDown, Calculator, Package, ChevronDown, Search, AlertCircle, AlertTriangle
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';

// ============================================
// FORMATTING HELPERS (Display only - never in calculations)
// ============================================
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatNumber = (num) => {
  return new Intl.NumberFormat('en-US').format(num);
};

// ============================================
// MOCKED AI RESPONSES
// ============================================
const MOCK_AI_RESPONSES = {
  explain: (best, others, product) => `
**Why ${best.supplierName} is the best option for ${product}:**

1. **Lowest Price**: At ${formatCurrency(best.unit_price)}/unit, this is the most cost-effective choice.

2. **FOB Price**: ${formatCurrency(best.unit_price)}/unit is competitive for this product category.

${others.length > 0 ? `3. **Savings**: You save ${formatCurrency(others[0].unit_price - best.unit_price)}/unit compared to the next option (${others[0].supplierName}).` : ''}

**Recommendation**: Verify quality with samples before placing a large order.
  `.trim(),

  negotiate: (quote, product) => {
    const targetPrice = quote.unit_price * 0.9;
    return `
**Negotiation Message for ${quote.supplierName}:**

---

Dear ${quote.supplierName} Team,

Thank you for your quotation for ${product} at ${formatCurrency(quote.unit_price)}/unit (${quote.incoterm || 'FOB'}).

After reviewing our options, we're interested in establishing a long-term partnership. To proceed:

• **Target Price**: ${formatCurrency(targetPrice)}/unit for orders of ${formatNumber(quote.moq * 2)}+ units
• **Payment Terms**: 30% deposit, 70% before shipment

Please let us know what adjustments are possible.

Best regards,
[Your Name]

---
    `.trim();
  },
};

// ============================================
// SEARCHABLE PRODUCT SELECTOR
// ============================================
function ProductSelector({ products, quotes, selectedProductId, onSelect, quoteCounts }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const productsWithCounts = useMemo(() => {
    return products.map(product => ({
      ...product,
      quoteCount: quoteCounts[product.id] || 0,
    }));
  }, [products, quoteCounts]);

  const filteredProducts = useMemo(() => {
    // Exclude the currently selected product from dropdown to avoid duplication
    const availableProducts = productsWithCounts.filter(p => p.id !== selectedProductId);

    if (!searchTerm.trim()) return availableProducts;
    const term = searchTerm.toLowerCase();
    return availableProducts.filter(p =>
      p.name.toLowerCase().includes(term) ||
      (p.category && p.category.toLowerCase().includes(term))
    );
  }, [productsWithCounts, searchTerm, selectedProductId]);

  // Group by category
  const groupedProducts = useMemo(() => {
    const groups = {};
    filteredProducts.forEach(product => {
      const cat = product.category || 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(product);
    });
    return groups;
  }, [filteredProducts]);

  const selectedProduct = productsWithCounts.find(p => p.id === selectedProductId);

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        style={{
          width: '100%',
          padding: '14px 18px',
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '10px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '0.95rem',
          fontWeight: 500,
          transition: 'all 0.2s',
          textAlign: 'left',
        }}
        onMouseEnter={(e) => {
          if (!isOpen) e.currentTarget.style.borderColor = '#3b82f6';
        }}
        onMouseLeave={(e) => {
          if (!isOpen) e.currentTarget.style.borderColor = '#e5e7eb';
        }}
      >
        <Package size={20} style={{ color: '#64748b', flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedProduct ? (
            <>
              {selectedProduct.name}
              <span style={{
                marginLeft: '8px',
                padding: '2px 8px',
                background: selectedProduct.quoteCount > 0 ? '#d1fae5' : '#fee2e2',
                color: selectedProduct.quoteCount > 0 ? '#065f46' : '#991b1b',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}>
                {selectedProduct.quoteCount} {selectedProduct.quoteCount === 1 ? 'quote' : 'quotes'}
              </span>
            </>
          ) : (
            <span style={{ color: '#9ca3af' }}>Select a buying intent to compare...</span>
          )}
        </span>
        <ChevronDown size={18} style={{
          color: '#64748b',
          flexShrink: 0,
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 0.2s',
        }} />
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '8px',
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
          maxHeight: '500px',
          overflowY: 'auto',
          zIndex: 1000,
        }}>
          {/* Search input */}
          <div style={{
            position: 'sticky',
            top: 0,
            background: 'white',
            borderBottom: '2px solid #e5e7eb',
            padding: '16px',
            zIndex: 10,
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '12px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              background: '#f9fafb',
            }}>
              <Search size={18} style={{ color: '#9ca3af', flexShrink: 0 }} />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search by name or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  width: '100%',
                  fontSize: '0.95rem',
                  color: '#1f2937',
                }}
                onClick={(e) => e.stopPropagation()}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    color: '#9ca3af',
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          <div>
            {filteredProducts.length === 0 ? (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: '#9ca3af',
                fontSize: '0.95rem',
              }}>
                {searchTerm ? (
                  <>
                    No other buying intents found
                    <div style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                      Try a different search term
                    </div>
                  </>
                ) : (
                  <>
                    No other buying intents available
                    <div style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                      Currently viewing: {selectedProduct?.name}
                    </div>
                  </>
                )}
              </div>
            ) : (
              Object.entries(groupedProducts).map(([category, categoryProducts]) => (
                <div key={category}>
                  <div style={{
                    padding: '10px 16px',
                    background: '#f9fafb',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    position: 'sticky',
                    top: '72px',
                    zIndex: 5,
                    borderTop: '1px solid #e5e7eb',
                  }}>
                    {category}
                  </div>
                  {categoryProducts.map(product => (
                    <button
                      key={product.id}
                      onClick={() => {
                        onSelect(product.id);
                        setIsOpen(false);
                        setSearchTerm('');
                      }}
                      type="button"
                      style={{
                        width: '100%',
                        padding: '14px 18px',
                        textAlign: 'left',
                        border: 'none',
                        background: 'white',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        borderBottom: '1px solid #f3f4f6',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = '#f9fafb';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = 'white';
                      }}
                    >
                      <span style={{
                        flex: 1,
                        color: '#374151',
                        fontWeight: 400,
                      }}>
                        {product.name}
                      </span>
                      <span style={{
                        padding: '3px 10px',
                        background: product.quoteCount > 0 ? '#d1fae5' : '#fee2e2',
                        color: product.quoteCount > 0 ? '#065f46' : '#991b1b',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}>
                        {product.quoteCount}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================
// MAIN QUOTE COMPARISON PAGE
// ============================================
function QuoteComparison() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, computed } = useAppContext();
  const { products } = state;
  const [lineItems, setLineItems] = React.useState([]);
  const [quoteCounts, setQuoteCounts] = React.useState({});

  const [selectedProductId, setSelectedProductId] = useState(location.state?.productId || null);
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [isSelectionLocked, setIsSelectionLocked] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAction, setAiAction] = useState('');
  const [loadingCounts, setLoadingCounts] = React.useState(true); // track loading state

  // Load quote counts for all products
  React.useEffect(() => {
    const loadQuoteCounts = async () => {
      setLoadingCounts(true);
      const counts = {};
      for (const product of products) {
        // Count both old quotes AND new line items (same as ProductDetail page)
        const oldQuotes = computed.getProductQuotes(product.id);
        const newLineItems = await computed.getLineItemsForBuyingIntent(product.id);
        counts[product.id] = oldQuotes.length + newLineItems.length;
      }
      setQuoteCounts(counts);
      setLoadingCounts(false);
    };
    if (products.length > 0) {
      loadQuoteCounts();
    } else {
      setLoadingCounts(false);
    }
  }, [products, computed]);

  // Load line items when product changes
  React.useEffect(() => {
    const loadLineItems = async () => {
      if (!selectedProductId) {
        setLineItems([]);
        return;
      }

      // Load BOTH old quotes AND new line items (same as ProductDetail page)
      const oldQuotes = computed.getProductQuotes(selectedProductId);
      const newLineItems = await computed.getLineItemsForBuyingIntent(selectedProductId);

      // Transform old quotes to line item format
      const oldQuotesAsLineItems = oldQuotes.map(quote => ({
        id: quote.id,
        unit_price: quote.unitPrice || quote.fields?.unitPrice || 0,
        moq: quote.moq || quote.fields?.moq || 1,
        currency: quote.currency || quote.fields?.currency || 'USD',
        incoterm: quote.incoterm || quote.fields?.incoterm || 'FOB',
        supplierName: quote.supplierName || quote.supplier_name,
        supplier: null,
        created_at: quote.created_at,
      }));

      // Combine old quotes and new line items
      setLineItems([...oldQuotesAsLineItems, ...newLineItems]);
    };
    loadLineItems();
  }, [selectedProductId, computed]);

  // Selected product
  const selectedProduct = useMemo(() => {
    return products.find(p => p.id === selectedProductId);
  }, [products, selectedProductId]);

  // ============================================
  // PROCESS AND SORT QUOTES BY PRICE
  // ============================================
  const quotesWithLanded = useMemo(() => {
    if (!selectedProductId || lineItems.length === 0) return [];

    // Transform line items to quote format and validate
    const validQuotes = lineItems
      .map(item => ({
        id: item.id,
        supplierName: item.supplierName || item.supplier?.supplier_name,
        unit_price: item.unit_price,
        currency: item.currency || 'USD',
        moq: item.moq || 1,
        incoterm: item.incoterm || 'FOB',
        created_at: item.created_at,
      }))
      .filter(q => q.unit_price > 0 && q.moq > 0);

    // Sort by unit_price (lowest first = best)
    return validQuotes.sort((a, b) => a.unit_price - b.unit_price);
  }, [lineItems, selectedProductId]);

  // Invalid quotes (for warning)
  const invalidQuotes = useMemo(() => {
    if (!selectedProductId || lineItems.length === 0) return [];
    return lineItems
      .filter(item => {
        const price = item.unit_price || 0;
        const moq = item.moq || 0;
        return price <= 0 || moq <= 0;
      });
  }, [lineItems, selectedProductId]);

  // Best quote = lowest unit_price
  const bestQuote = quotesWithLanded[0];
  const otherQuotes = quotesWithLanded.slice(1);
  const isSupplierSelected = selectedSupplierId === bestQuote?.id;

  // Handlers
  const handleProductChange = (productId) => {
    setSelectedProductId(productId);
    setSelectedSupplierId(null);
    setIsSelectionLocked(false);
    setAiResponse('');
    setAiAction('');
  };

  const handleSelectSupplier = (quoteId) => {
    setSelectedSupplierId(quoteId);
    setIsSelectionLocked(true);
  };

  const handleExportDecision = () => {
    alert('PDF export: Your supplier selection would be exported.');
  };

  const handleExportExcel = () => {
    alert('Excel export: Comparison data would be downloaded.');
  };

  const handleExportPDF = () => {
    alert('PDF export: Comparison report would be generated.');
  };

  const handleAIExplain = () => {
    if (!bestQuote || !selectedProduct) return;
    setAiLoading(true);
    setAiAction('explain');
    setTimeout(() => {
      setAiResponse(MOCK_AI_RESPONSES.explain(bestQuote, otherQuotes, selectedProduct.name));
      setAiLoading(false);
    }, 800);
  };

  const handleAINegotiate = (quote) => {
    if (!selectedProduct) return;
    setAiLoading(true);
    setAiAction('negotiate');
    setTimeout(() => {
      setAiResponse(MOCK_AI_RESPONSES.negotiate(quote, selectedProduct.name));
      setAiLoading(false);
    }, 800);
  };

  const clearAI = () => {
    setAiResponse('');
    setAiAction('');
  };

  return (
    <div className="page">
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="icon-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2>Compare Quotes</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '2px' }}>
              Compare suppliers for a buying intent and select the best price
            </p>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="btn"
            onClick={handleExportExcel}
            style={{ background: '#217346', color: 'white' }}
            disabled={quotesWithLanded.length === 0}
          >
            <FileSpreadsheet size={16} /> Excel
          </button>
          <button
            className="btn"
            onClick={handleExportPDF}
            style={{ background: '#dc2626', color: 'white' }}
            disabled={quotesWithLanded.length === 0}
          >
            <FileText size={16} /> PDF
          </button>
        </div>
      </div>

      <div className="content">
        {/* Loading State */}
        {loadingCounts ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 20px',
            gap: '16px',
          }}>
            <div className="spinner" style={{ width: '40px', height: '40px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Loading buying intents...</p>
          </div>
        ) : (
          <>
        {/* Recently Used Buying Intents */}
        {!loadingCounts && products.filter(p => (quoteCounts[p.id] || 0) > 0 && p.id !== selectedProductId).slice(0, 3).length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', marginBottom: '12px' }}>
              Recently Used
            </h3>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {products.filter(p => (quoteCounts[p.id] || 0) > 0 && p.id !== selectedProductId).slice(0, 3).map(product => (
                <button
                  key={product.id}
                  onClick={() => handleProductChange(product.id)}
                  style={{
                    padding: '12px 18px',
                    background: 'white',
                    border: '2px solid #e5e7eb',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'all 0.2s',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f9fafb';
                    e.currentTarget.style.borderColor = '#3b82f6';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'white';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <Package size={18} style={{ color: '#64748b' }} />
                  <span>{product.name}</span>
                  <span style={{
                    padding: '3px 10px',
                    background: '#d1fae5',
                    color: '#065f46',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}>
                    {quoteCounts[product.id]} {quoteCounts[product.id] === 1 ? 'quote' : 'quotes'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Product Selector */}
        <div className="card" style={{ marginBottom: '24px', border: '2px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div className="card-header" style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
            <span className="card-title">
              <Package size={18} />
              {selectedProduct ? (
                <>
                  <span style={{ fontWeight: 700 }}>{selectedProduct.name}</span>
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: '8px' }}>
                    ({quoteCounts[selectedProductId] || 0} {quoteCounts[selectedProductId] === 1 ? 'quote' : 'quotes'})
                  </span>
                </>
              ) : (
                'Select Buying Intent to Compare'
              )}
            </span>
          </div>
          <div className="card-body">
            <ProductSelector
              products={products}
              quotes={[]}
              selectedProductId={selectedProductId}
              onSelect={handleProductChange}
              quoteCounts={quoteCounts}
            />
            {!selectedProductId && (
              <div className="info-message" style={{ marginTop: '16px', padding: '12px 16px', background: '#eff6ff', borderLeft: '4px solid #3b82f6', borderRadius: '6px' }}>
                <AlertCircle size={16} style={{ color: '#3b82f6' }} />
                <span style={{ color: '#1e40af' }}>Select a buying intent above to compare supplier quotes and find the best price</span>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        {selectedProductId ? (
          <>
            {/* Invalid Quotes Warning */}
            {invalidQuotes.length > 0 && (
              <div className="validation-warning" style={{ marginBottom: '16px' }}>
                <AlertTriangle size={16} />
                <span>
                  {invalidQuotes.length} quote(s) excluded due to invalid data (price ≤ $0 or quantity ≤ 0)
                </span>
              </div>
            )}

            {quotesWithLanded.length === 0 ? (
              <div className="empty-state">
                <TrendingDown size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                <h3>No valid quotes for {selectedProduct?.name}</h3>
                <p>Add quotes with valid prices and quantities</p>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: '16px' }}
                  onClick={() => navigate(`/products/${selectedProductId}`)}
                >
                  Add Quotes
                </button>
              </div>
            ) : (
              <>
                {/* Best Option Card */}
                {bestQuote && (
                  <div
                    className="best-quote-card"
                    style={{
                      marginBottom: '24px',
                      borderColor: isSupplierSelected ? 'var(--success)' : undefined,
                      background: isSupplierSelected
                        ? '#f0fdf4'
                        : undefined,
                    }}
                  >
                    {isSupplierSelected ? (
                      <div className="selection-complete">
                        <div className="best-quote-selected">
                          <div className="selected-icon">
                            <CheckCircle2 size={48} />
                          </div>
                          <div className="selected-content">
                            <h3>Supplier Selected</h3>
                            <p>{bestQuote.supplierName} — {formatCurrency(bestQuote.unit_price)}/unit</p>
                          </div>
                        </div>

                        <div className="next-actions-section">
                          <p className="next-actions-helper">
                            You've selected the best option for {selectedProduct?.name}. What's next?
                          </p>
                          <div className="next-actions-title">Next Actions</div>
                          <div className="next-actions-buttons">
                            <button className="btn btn-secondary" onClick={handleExportDecision}>
                              <FileDown size={18} /> Export Decision
                            </button>
                            <button className="btn btn-secondary" onClick={() => handleAINegotiate(bestQuote)}>
                              <MessageSquare size={18} /> Negotiation Message
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="best-quote-header">
                          <Trophy size={24} color="#f59e0b" />
                          <div style={{ flex: 1 }}>
                            <h3 style={{ margin: 0 }}>Best: {bestQuote.supplierName}</h3>
                            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                              Lowest price ({bestQuote.incoterm})
                            </p>
                          </div>
                          <div className="best-quote-price">
                            <span className="price-label">Unit Price</span>
                            <span className="price-value">{formatCurrency(bestQuote.unit_price)}/unit</span>
                          </div>
                        </div>
                        
                        <div className="best-quote-cta">
                          <button 
                            className="btn btn-select-supplier"
                            onClick={() => handleSelectSupplier(bestQuote.id)}
                          >
                            <Check size={20} /> Select This Supplier
                          </button>
                        </div>

                        {/* Secondary Actions - Grouped and less prominent */}
                        <div className="secondary-actions" style={{
                          display: 'flex',
                          gap: '8px',
                          justifyContent: 'center',
                          paddingTop: '12px',
                          borderTop: '1px solid var(--border-light)',
                          marginTop: '16px'
                        }}>
                          <button className="btn btn-ghost btn-sm" onClick={handleAIExplain} title="Explain why this is best">
                            <Sparkles size={14} /> Why Best?
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleAINegotiate(bestQuote)} title="Generate negotiation message">
                            <MessageSquare size={14} /> Negotiate
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Comparison Table */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">
                      <TrendingDown size={18} /> {quotesWithLanded.length} Quotes for {selectedProduct?.name}
                    </span>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="table comparison-table">
                      <thead>
                        <tr>
                          <th style={{ width: '50px' }}>#</th>
                          <th>Supplier</th>
                          <th>Unit Price</th>
                          <th>MOQ</th>
                          <th>Total (at MOQ)</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quotesWithLanded.map((quote, index) => {
                          const isBest = index === 0;
                          const isSelected = selectedSupplierId === quote.id;
                          const savingsVsNext = index < quotesWithLanded.length - 1
                            ? quotesWithLanded[index + 1].unit_price - quote.unit_price
                            : 0;
                          const totalAtMoq = quote.unit_price * quote.moq;

                          return (
                            <tr
                              key={quote.id}
                              className={`${isBest ? 'row-highlight' : ''} ${isSelected ? 'row-selected' : ''}`}
                            >
                              <td>
                                {isSelected ? (
                                  <span className="rank-badge selected"><Check size={14} /></span>
                                ) : isBest ? (
                                  <span className="rank-badge best"><Trophy size={14} /></span>
                                ) : (
                                  <span className="rank-badge">{index + 1}</span>
                                )}
                              </td>
                              <td style={{ fontWeight: 500 }}>
                                {quote.supplierName}
                                {isSelected && <span className="selected-label">Selected</span>}
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  {quote.incoterm}
                                </div>
                              </td>
                              <td>
                                <span style={{
                                  fontWeight: 700,
                                  color: isBest ? 'var(--success)' : 'var(--text-primary)',
                                }}>
                                  {formatCurrency(quote.unit_price)}/unit
                                </span>
                                {isBest && savingsVsNext > 0 && (
                                  <span style={{
                                    display: 'block',
                                    fontSize: '0.7rem',
                                    color: 'var(--success)',
                                  }}>
                                    Saves {formatCurrency(savingsVsNext)}/unit
                                  </span>
                                )}
                              </td>
                              <td>{formatNumber(quote.moq)} units</td>
                              <td style={{ color: 'var(--text-secondary)' }}>
                                {formatCurrency(totalAtMoq)}
                              </td>
                              <td>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => handleAINegotiate(quote)}
                                  title="Generate negotiation message"
                                >
                                  <MessageSquare size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* AI Response Panel */}
                {(aiResponse || aiLoading) && (
                  <div className="card" style={{ marginTop: '24px' }}>
                    <div className="card-header">
                      <span className="card-title">
                        <Sparkles size={18} color="var(--accent)" />
                        {aiAction === 'explain' ? 'AI Analysis' : 'Generated Message'}
                      </span>
                      <button className="icon-btn" onClick={clearAI}>
                        <X size={18} />
                      </button>
                    </div>
                    <div className="card-body">
                      {aiLoading ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '20px' }}>
                          <div className="spinner" />
                          <span>Generating...</span>
                        </div>
                      ) : (
                        <div className="ai-response-content">
                          {aiResponse.split('\n').map((line, i) => {
                            if (line.startsWith('**') && line.endsWith('**')) {
                              return <h4 key={i} style={{ marginTop: i > 0 ? '16px' : 0 }}>{line.replace(/\*\*/g, '')}</h4>;
                            }
                            if (line.startsWith('• ')) {
                              return <li key={i} style={{ marginLeft: '20px' }}>{line.substring(2)}</li>;
                            }
                            if (line.startsWith('---')) {
                              return <hr key={i} style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--border)' }} />;
                            }
                            if (line.trim() === '') return <br key={i} />;
                            return <p key={i} style={{ margin: '8px 0' }}>{line}</p>;
                          })}
                          {aiAction === 'negotiate' && (
                            <button
                              className="btn btn-primary"
                              style={{ marginTop: '16px' }}
                              onClick={() => {
                                navigator.clipboard.writeText(aiResponse.replace(/\*\*/g, ''));
                                alert('Copied to clipboard!');
                              }}
                            >
                              Copy Message
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div style={{
            padding: '80px 20px',
            textAlign: 'center',
            background: '#f9fafb',
            borderRadius: '16px',
            border: '2px dashed #cbd5e1',
          }}>
            <div style={{
              display: 'inline-flex',
              padding: '20px',
              background: 'white',
              borderRadius: '50%',
              marginBottom: '20px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}>
              <TrendingDown size={48} style={{ color: '#94a3b8' }} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
              Select a Buying Intent to Compare
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.95rem', maxWidth: '400px', margin: '0 auto' }}>
              Choose a buying intent above to view and compare supplier quotes side-by-side.
            </p>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}

export default QuoteComparison;
