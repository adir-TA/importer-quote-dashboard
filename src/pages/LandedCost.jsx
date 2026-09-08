import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calculator, DollarSign, Plus, Trash2, RotateCcw, ArrowRight, Check,
  Package, ChevronDown, Search, X, AlertCircle, AlertTriangle
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';

// DISPLAY ONLY - never used inside calculations.
// These previously hardcoded 'USD', so a CNY quote's landed cost was labelled
// with a dollar sign. See src/utils/currency.js.
import { formatCurrency, formatNumber, convertAmount, normalizeCurrency } from '../utils/currency';

// ============================================
// SEARCHABLE PRODUCT SELECTOR COMPONENT
// ============================================
function ProductSelector({ products, quotes, selectedProductId, onSelect, quoteCounts }) {
  const { t } = useLanguage();
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

  // Count quotes per product
  const productsWithCounts = useMemo(() => {
    return products.map(product => ({
      ...product,
      quoteCount: quoteCounts[product.id] || 0,
    }));
  }, [products, quoteCounts]);

  // Filter by search (case-insensitive - name or category)
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return productsWithCounts;
    const term = searchTerm.toLowerCase();
    return productsWithCounts.filter(p =>
      p.name.toLowerCase().includes(term) ||
      (p.category && p.category.toLowerCase().includes(term))
    );
  }, [productsWithCounts, searchTerm]);

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
          border: '2px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: 'var(--text-md)',
          fontWeight: 500,
          transition: 'all 0.2s',
          textAlign: 'start',
        }}
        onMouseEnter={(e) => {
          if (!isOpen) e.currentTarget.style.borderColor = 'var(--accent)';
        }}
        onMouseLeave={(e) => {
          if (!isOpen) e.currentTarget.style.borderColor = 'var(--border)';
        }}
      >
        <Package size={20} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedProduct ? (
            <>
              {selectedProduct.name}
              <span style={{
                marginInlineStart: '8px',
                padding: '2px 8px',
                background: selectedProduct.quoteCount > 0 ? 'var(--success-light)' : 'var(--error-light)',
                color: selectedProduct.quoteCount > 0 ? 'var(--success)' : 'var(--error)',
                borderRadius: 'var(--radius-xs)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
              }}>
                {selectedProduct.quoteCount} {selectedProduct.quoteCount === 1 ? 'quote' : 'quotes'}
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--text-subtle)' }}>{t('landedCost.selectIntent')}</span>
          )}
        </span>
        <ChevronDown size={18} style={{
          color: 'var(--text-secondary)',
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
          border: '2px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
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
            borderBottom: '2px solid var(--border)',
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
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--grey-50)',
            }}>
              <Search size={18} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />
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
                  fontSize: 'var(--text-md)',
                  color: 'var(--text-primary)',
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
                    color: 'var(--text-subtle)',
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
                color: 'var(--text-subtle)',
                fontSize: 'var(--text-md)',
              }}>
                No buying intents found
                {searchTerm && (
                  <div style={{ marginTop: '8px', fontSize: 'var(--text-sm)' }}>
                    Try a different search term
                  </div>
                )}
              </div>
            ) : (
              Object.entries(groupedProducts).map(([category, categoryProducts]) => (
                <div key={category}>
                  <div style={{
                    padding: '10px 16px',
                    background: 'var(--grey-50)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    position: 'sticky',
                    top: '72px',
                    zIndex: 5,
                    borderTop: '1px solid var(--border)',
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
                        textAlign: 'start',
                        border: 'none',
                        background: product.id === selectedProductId ? 'var(--accent-light)' : 'white',
                        cursor: 'pointer',
                        fontSize: 'var(--text-md)',
                        borderBottom: '1px solid var(--grey-100)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        if (product.id !== selectedProductId) {
                          e.target.style.background = 'var(--grey-50)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (product.id !== selectedProductId) {
                          e.target.style.background = 'white';
                        }
                      }}
                    >
                      {product.id === selectedProductId && (
                        <Check size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      )}
                      <span style={{
                        flex: 1,
                        color: 'var(--text-secondary)',
                        fontWeight: product.id === selectedProductId ? 600 : 400,
                      }}>
                        {product.name}
                      </span>
                      <span style={{
                        padding: '3px 10px',
                        background: product.quoteCount > 0 ? 'var(--success-light)' : 'var(--error-light)',
                        color: product.quoteCount > 0 ? 'var(--success)' : 'var(--error)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 'var(--text-xs)',
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
// SEARCHABLE QUOTE SELECTOR COMPONENT
// ============================================
function QuoteSelector({ quotes, selectedQuoteId, onSelect, productName }) {
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

  // Filter quotes by search (supplier name)
  const filteredQuotes = useMemo(() => {
    if (!searchTerm.trim()) return quotes;
    const term = searchTerm.toLowerCase();
    return quotes.filter(q => q.supplierName?.toLowerCase().includes(term));
  }, [quotes, searchTerm]);

  const selectedQuote = quotes.find(q => q.id === selectedQuoteId);

  if (quotes.length === 0) {
    return (
      <div className="empty-state-inline">
        <p>No quotes for this product yet.</p>
      </div>
    );
  }

  return (
    <div className="quote-selector" ref={dropdownRef}>
      <button 
        className="quote-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span className="trigger-text">
          {selectedQuote ? (
            <>
              <strong>{selectedQuote.supplierName}</strong>
              <span className="quote-details">
                {formatCurrency(selectedQuote.unitPrice, selectedQuote.currency)}/unit • {selectedQuote.incoterm || 'FOB'}
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>-- Select a quote --</span>
          )}
        </span>
        <ChevronDown size={18} className={`trigger-chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="quote-selector-dropdown">
          <div className="quote-selector-header">
            Quotes for {productName}
          </div>
          <div className="product-selector-search">
            <Search size={16} className="search-icon" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by supplier..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button className="search-clear" onClick={() => setSearchTerm('')} type="button">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="quote-selector-options">
            {filteredQuotes.length === 0 ? (
              <div className="product-selector-empty">No quotes match "{searchTerm}"</div>
            ) : (
              filteredQuotes.map(quote => {
                const unitPrice = parseFloat(quote.unitPrice) || 0;
                return (
                  <button
                    key={quote.id}
                    className={`quote-option ${quote.id === selectedQuoteId ? 'selected' : ''}`}
                    onClick={() => { onSelect(quote.id); setIsOpen(false); setSearchTerm(''); }}
                    type="button"
                  >
                    <div className="quote-option-main">
                      <span className="quote-supplier">{quote.supplierName}</span>
                      <span className="quote-incoterm">{quote.incoterm || 'FOB'}</span>
                    </div>
                    <div className="quote-option-price">
                      {formatCurrency(unitPrice, quote.currency)}/unit
                    </div>
                    {quote.id === selectedQuoteId && <Check size={16} className="option-check" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// MAIN LANDED COST PAGE
// ============================================
function LandedCost() {
  const navigate = useNavigate();
  const { state, computed } = useAppContext();
  const { t } = useLanguage();
  const { fees, products, settings, feeSaveError } = state;
  // Fees are denominated in the base currency, so the whole landed-cost
  // calculation runs in the base currency. Adding a fixed $500 freight fee to
  // a CNY FOB total (as before) mixed units and produced a meaningless number.
  const baseCurrency = normalizeCurrency(settings?.currency);
  const fxRates = settings?.fxRates;

  // State
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
  const [customQuantity, setCustomQuantity] = useState('');
  const [lineItems, setLineItems] = React.useState([]);
  const [quoteCounts, setQuoteCounts] = React.useState({});
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

      // Load BOTH old quotes AND new line items (same as QuoteComparison page)
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

  // Derived: Selected product
  const selectedProduct = useMemo(() => {
    return products.find(p => p.id === selectedProductId);
  }, [products, selectedProductId]);

  // Derived: Transform line items to quote format
  const productQuotes = useMemo(() => {
    return lineItems.map(item => ({
      id: item.id,
      product_id: selectedProductId,
      supplierName: item.supplierName || item.supplier?.supplier_name,
      unitPrice: item.unit_price,
      currency: item.currency || 'USD',
      moq: item.moq || 1,
      incoterm: item.incoterm || 'FOB',
    }));
  }, [lineItems, selectedProductId]);

  // Derived: Selected quote
  const selectedQuote = useMemo(() => {
    return productQuotes.find(q => q.id === selectedQuoteId);
  }, [productQuotes, selectedQuoteId]);

  // ============================================
  // INPUT VALIDATION
  // ============================================
  const validation = useMemo(() => {
    if (!selectedQuote) return { valid: false, errors: [], warnings: [] };
    
    const errors = [];
    const warnings = [];
    const quoteCurrency = normalizeCurrency(selectedQuote.currency);
    const quotedPrice = parseFloat(selectedQuote.unitPrice);
    const moq = parseInt(selectedQuote.moq) || 1;
    const qty = customQuantity ? parseInt(customQuantity) : moq;

    // Convert into the base currency before anything is added to it
    const unitPrice =
      quoteCurrency === baseCurrency
        ? quotedPrice
        : convertAmount(quotedPrice, quoteCurrency, baseCurrency, fxRates);

    // Safety check: unit_price must be > 0
    if (isNaN(quotedPrice) || quotedPrice <= 0) {
      errors.push('Unit price must be greater than 0');
    } else if (unitPrice === null) {
      errors.push(
        `No ${baseCurrency} exchange rate for ${quoteCurrency}. Add one in Settings to calculate landed cost.`
      );
    }
    
    // Safety check: quantity must be > 0
    if (isNaN(qty) || qty <= 0) {
      errors.push('Quantity must be greater than 0 units');
    }
    
    // Soft validation: warn if quantity < MOQ
    if (customQuantity && qty > 0 && qty < moq) {
      warnings.push(`Quantity is below MOQ (${formatNumber(moq)} units) — supplier pricing may not be valid`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      // Always expressed in baseCurrency from here on
      unitPrice: unitPrice === null || isNaN(unitPrice) ? 0 : unitPrice,
      quotedPrice: isNaN(quotedPrice) ? 0 : quotedPrice,
      quoteCurrency,
      isConverted: quoteCurrency !== baseCurrency,
      quantity: isNaN(qty) || qty <= 0 ? 1 : qty,
      moq,
    };
  }, [selectedQuote, customQuantity, baseCurrency, fxRates]);

  // ============================================
  // LANDED COST CALCULATION
  // ============================================
  // FORMULA (strict separation of money vs units):
  //   unit_price     = price per unit ($/unit) - MONEY
  //   quantity       = number of units ordered - UNITS  
  //   FOB_total      = unit_price × quantity - MONEY ($ total)
  //   total_fees     = fixed fees + (percentage fees × FOB_total) - MONEY
  //   total_landed   = FOB_total + total_fees - MONEY ($ total)
  //   landed_per_unit = total_landed ÷ quantity - MONEY ($/unit)
  // ============================================
  const calculation = useMemo(() => {
    if (!selectedQuote || !validation.valid) return null;

    // Step 1: Extract unit_price ($/unit) - this is MONEY
    const unit_price = validation.unitPrice;
    
    // Step 2: Determine quantity (units) - this is UNITS, not money
    const quantity = validation.quantity;
    
    // Step 3: Calculate FOB_total ($ total) = unit_price × quantity
    // This converts $/unit × units = $ (money total)
    const FOB_total = unit_price * quantity;

    // Step 4: Calculate fees (all in $ money)
    let total_fixed_fees = 0;    // Fixed $ per shipment
    let total_percent_fees = 0;  // Percentage of FOB_total
    
    const fee_breakdown = fees.map(fee => {
      const fee_value = parseFloat(fee.value) || 0;
      let fee_amount = 0;  // Always in $ (money)
      
      if (fee.type === 'percentage') {
        // Percentage fee: (FOB_total × percentage) / 100 = $ amount
        fee_amount = (FOB_total * fee_value) / 100;
        total_percent_fees += fee_amount;
      } else {
        // Fixed fee: Already in $ (added once per shipment)
        fee_amount = fee_value;
        total_fixed_fees += fee_amount;
      }
      
      return { ...fee, amount: fee_amount };
    });

    // Step 5: Sum all fees ($ total)
    const total_fees = total_fixed_fees + total_percent_fees;
    
    // Step 6: Calculate total landed cost ($ total)
    // total_landed = FOB_total + total_fees
    const total_landed = FOB_total + total_fees;
    
    // Step 7: Calculate landed cost per unit ($/unit)
    // landed_per_unit = total_landed ÷ quantity
    // This converts $ ÷ units = $/unit
    const landed_per_unit = total_landed / quantity;
    
    // Step 8: Calculate fee markup as percentage of FOB
    const fee_markup_percent = FOB_total > 0 ? (total_fees / FOB_total) * 100 : 0;

    // ============================================
    // VERIFICATION (math check)
    // ============================================
    // landed_per_unit should equal:
    // (unit_price × quantity + total_fees) / quantity
    // = unit_price + (total_fees / quantity)
    // ============================================
    const expected_landed = unit_price + (total_fees / quantity);
    const math_verified = Math.abs(landed_per_unit - expected_landed) < 0.001;

    return {
      // Input values (with types)
      unit_price,           // $/unit (money)
      quantity,             // units (count)
      
      // Calculated values (all money)
      FOB_total,            // $ total
      total_fixed_fees,     // $ total
      total_percent_fees,   // $ total
      total_fees,           // $ total
      total_landed,         // $ total
      landed_per_unit,      // $/unit (money)
      fee_markup_percent,   // % (ratio)
      fee_breakdown,        // Array with amounts in $
      
      // Verification
      math_verified,
    };
  }, [selectedQuote, validation, fees]);

  // Handlers
  const handleProductChange = (productId) => {
    setSelectedProductId(productId);
    setSelectedQuoteId('');
    setCustomQuantity('');
  };

  const handleFeeChange = (feeId, field, value) => {
    // Changing the fee type is a discrete choice with no blur to flush on, so
    // it persists immediately; free-text name/value edits stay debounced and
    // are flushed by handleFeeBlur.
    const immediate = field === 'type';
    actions.updateFee(
      feeId,
      { [field]: field === 'value' ? parseFloat(value) || 0 : value },
      immediate
    );
  };

  // The write is debounced in AppContext; blurring commits it immediately.
  const handleFeeBlur = () => actions.flushFees();

  const handleAddFee = () => {
    actions.addFee({ name: 'New Fee', type: 'fixed', value: 0 });
  };

  const handleDeleteFee = (feeId) => {
    actions.deleteFee(feeId);
  };

  const handleResetFees = () => {
    actions.resetFees();
  };

  return (
    <div className="page">
      <div className="header">
        <div>
          <h2>{t('landedCost.title')}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-md)', marginTop: '4px' }}>
            Calculate true landed cost including all import fees for accurate decision-making
          </p>
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
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-md)' }}>{t('landedCost.loadingIntents')}</p>
          </div>
        ) : (
          <>
        {/* Recently Used Buying Intents */}
        {!selectedProductId && products.filter(p => (quoteCounts[p.id] || 0) > 0).slice(0, 3).length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Recently Used
            </h3>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {products.filter(p => (quoteCounts[p.id] || 0) > 0).slice(0, 3).map(product => (
                <button
                  key={product.id}
                  onClick={() => handleProductChange(product.id)}
                  style={{
                    padding: '12px 18px',
                    background: 'white',
                    border: '2px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'all 0.2s',
                    fontSize: 'var(--text-base)',
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--grey-50)';
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'white';
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <Package size={18} style={{ color: 'var(--text-secondary)' }} />
                  <span>{product.name}</span>
                  <span style={{
                    padding: '3px 10px',
                    background: 'var(--success-light)',
                    color: 'var(--success)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                  }}>
                    {quoteCounts[product.id]} {quoteCounts[product.id] === 1 ? 'quote' : 'quotes'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 1: Product Selection */}
        <div className="card" style={{ marginBottom: '24px', border: '2px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="card-header" style={{ background: 'var(--grey-50)', borderBottom: '2px solid var(--border)' }}>
            <span className="card-title">
              <Package size={18} /> Select Buying Intent to Calculate
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
              <div className="info-message" style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--accent-light)', borderInlineStart: '4px solid var(--accent)', borderRadius: 'var(--radius-sm)' }}>
                <AlertCircle size={16} style={{ color: 'var(--accent)' }} />
                <span style={{ color: 'var(--accent-text)' }}>{t('landedCost.selectIntentPrompt')}</span>
              </div>
            )}
          </div>
        </div>

        {selectedProductId ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '24px' }}>
            {/* LEFT: Fee Configuration (Global) */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">
                  <DollarSign size={18} /> Import Fees (Global)
                </span>
                <button className="btn btn-ghost" onClick={handleResetFees}>
                  <RotateCcw size={14} /> Reset
                </button>
              </div>
              <div className="card-body">
                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginBottom: '20px' }}>
                  {/* Complete sentences per key - splitting a bolded label from
                      its predicate produced Hebrew that disagreed in gender
                      and number. */}
                  {t('landedCost.feesHint')}{' '}
                  {t('landedCost.fixedFeeHint')}{' '}
                  {t('landedCost.percentageFeeHint')}{' '}
                  {t('landedCost.amountsIn').replace('{currency}', baseCurrency)}
                </p>

                {/* A failed background save must not be silent */}
                {feeSaveError && (
                  <div className="validation-error" role="alert" style={{ marginBottom: '16px' }}>
                    <AlertCircle size={16} />
                    <span>Could not save your fees: {feeSaveError}</span>
                  </div>
                )}

                <div className="fees-list">
                  {fees.map((fee) => (
                    <div key={fee.id} className="fee-row">
                      <input
                        type="text"
                        className="form-input"
                        value={fee.name}
                        onChange={(e) => handleFeeChange(fee.id, 'name', e.target.value)}
                        onBlur={handleFeeBlur}
                        placeholder="Fee name"
                        style={{ flex: 2 }}
                      />
                      <select
                        className="form-select"
                        value={fee.type}
                        onChange={(e) => handleFeeChange(fee.id, 'type', e.target.value)}
                        style={{ width: '140px' }}
                      >
                        <option value="fixed">Fixed ($)</option>
                        <option value="percentage">% of FOB</option>
                      </select>
                      <div className="input-with-prefix" style={{ width: '110px' }}>
                        <span className="input-prefix">
                          {fee.type === 'percentage' ? '%' : '$'}
                        </span>
                        <input
                          type="number"
                          className="form-input"
                          value={fee.value}
                          onChange={(e) => handleFeeChange(fee.id, 'value', e.target.value)}
                          onBlur={handleFeeBlur}
                          step={fee.type === 'percentage' ? '0.1' : '1'}
                          min="0"
                        />
                      </div>
                      <button
                        className="icon-btn"
                        onClick={() => handleDeleteFee(fee.id)}
                        title="Remove fee"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  className="btn btn-ghost"
                  onClick={handleAddFee}
                  style={{ marginTop: '12px' }}
                >
                  <Plus size={16} /> Add Fee
                </button>
              </div>
            </div>

            {/* RIGHT: Quote Preview */}
            <div>
              {/* Quote Selection */}
              <div className="card" style={{ marginBottom: '16px' }}>
                <div className="card-header">
                  <span className="card-title">{t('landedCost.stepPreview')}</span>
                </div>
                <div className="card-body">
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label className="form-label">
                      Select quote for <strong>{selectedProduct?.name}</strong>
                    </label>
                    <QuoteSelector
                      quotes={productQuotes}
                      selectedQuoteId={selectedQuoteId}
                      onSelect={setSelectedQuoteId}
                      productName={selectedProduct?.name}
                    />
                  </div>

                  {selectedQuote && (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">
                        Order Quantity
                      </label>
                      <div className="input-with-suffix">
                        <input
                          type="number"
                          className="form-input"
                          placeholder={selectedQuote.moq || 1}
                          value={customQuantity}
                          onChange={(e) => setCustomQuantity(e.target.value)}
                          min="1"
                        />
                        <span className="input-suffix">units</span>
                      </div>
                      <p className="form-hint">
                        Default: {formatNumber(selectedQuote.moq || 1)} units (MOQ)
                      </p>
                    </div>
                  )}

                  {/* Validation Errors */}
                  {selectedQuote && !validation.valid && (
                    <div className="validation-errors" style={{ marginTop: '12px' }}>
                      {validation.errors.map((error, i) => (
                        <div key={i} className="validation-error">
                          <AlertTriangle size={14} />
                          <span>{error}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* MOQ Warnings (soft validation) */}
                  {selectedQuote && validation.valid && validation.warnings?.length > 0 && (
                    <div className="validation-warnings" style={{ marginTop: '12px' }}>
                      {validation.warnings.map((warning, i) => (
                        <div key={i} className="validation-warning">
                          <AlertCircle size={14} />
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Calculation Results */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">
                    Landed Cost Breakdown
                    {selectedQuote && (
                      <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginInlineStart: '8px' }}>
                        — {selectedQuote.supplierName}
                      </span>
                    )}
                  </span>
                </div>
                <div className="card-body">
                  {selectedQuote && calculation ? (
                    <>
                      {/* Hero Result - Emphasis on $/unit */}
                      <div className="result-hero">
                        <div className="result-label">{t('landedCost.landedCost')}</div>
                        <div className="result-value">
                          {formatCurrency(calculation.landed_per_unit, baseCurrency)}<span className="result-unit">/unit</span>
                        </div>
                        <div className="result-subtext">
                          vs {formatCurrency(calculation.unit_price, baseCurrency)}/unit FOB
                          {validation.isConverted && (
                            <span style={{ color: 'var(--text-muted)' }}>
                              {' '}(quoted {formatCurrency(validation.quotedPrice, validation.quoteCurrency)})
                            </span>
                          )}
                          {calculation.fee_markup_percent > 0 && (
                            <span className="result-badge">
                              +{calculation.fee_markup_percent.toFixed(1)}% fees
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Detailed Breakdown */}
                      <div className="result-breakdown" style={{ marginTop: '20px' }}>
                        <div className="breakdown-section-title">{t('landedCost.orderSummary')}</div>
                        <div className="breakdown-row">
                          <span>{t('landedCost.unitPriceFob')}</span>
                          <span>{formatCurrency(calculation.unit_price, baseCurrency)}/unit</span>
                        </div>
                        <div className="breakdown-row">
                          <span>{t('landedCost.quantity')}</span>
                          <span>{formatNumber(calculation.quantity)} units</span>
                        </div>
                        <div className="breakdown-row highlight">
                          <span>{t('landedCost.fobTotal')}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{formatCurrency(calculation.FOB_total, baseCurrency)}</span>
                        </div>

                        <div className="breakdown-section-title" style={{ marginTop: '16px' }}>
                          Import Fees
                        </div>
                        {calculation.fee_breakdown.map((fee) => (
                          <div key={fee.id} className="breakdown-row">
                            <span>
                              {fee.name}
                              <span className="fee-type-label">
                                {fee.type === 'percentage' ? `(${fee.value}% of FOB)` : '(fixed $)'}
                              </span>
                            </span>
                            <span>{formatCurrency(fee.amount, baseCurrency)}</span>
                          </div>
                        ))}
                        <div className="breakdown-row highlight">
                          <span>{t('landedCost.totalImportFees')}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{formatCurrency(calculation.total_fees, baseCurrency)}</span>
                        </div>

                        {/* Total section - visually secondary, $/unit emphasized */}
                        <div className="breakdown-row total" style={{ marginTop: '12px' }}>
                          <span>{t('landedCost.totalLandedCost')}</span>
                          <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-secondary)' }}>{formatCurrency(calculation.total_landed, baseCurrency)}</span>
                        </div>
                        <div className="breakdown-row total-unit">
                          <span>{t('landedCost.landedCostPerUnit')}</span>
                          <span style={{ fontWeight: 700, color: 'var(--success)' }}>{formatCurrency(calculation.landed_per_unit, baseCurrency)}/unit</span>
                        </div>

                        {/* Large order info text */}
                        {calculation.total_landed > 10000 && (
                          <div className="large-order-info" style={{
                            marginTop: '16px',
                            padding: '10px 12px',
                            background: 'var(--bg-secondary)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 'var(--text-sm)',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <AlertCircle size={14} />
                            <span>Large quantities increase total order value. Per-unit cost ({formatCurrency(calculation.landed_per_unit, baseCurrency)}/unit) is the key comparison metric.</span>
                          </div>
                        )}
                      </div>
                    </>
                  ) : selectedQuote && !validation.valid ? (
                    <div className="empty-state" style={{ padding: '32px 16px' }}>
                      <AlertTriangle size={32} style={{ opacity: 0.5, marginBottom: '12px', color: 'var(--warning)' }} />
                      <p>{t('landedCost.fixErrors')}</p>
                    </div>
                  ) : (
                    <div className="empty-state" style={{ padding: '32px 16px' }}>
                      <Calculator size={32} style={{ opacity: 0.5, marginBottom: '12px' }} />
                      <p>{t('landedCost.selectQuotePrompt')}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Compare Button */}
              {productQuotes.length >= 2 && (
                <div className="card" style={{ marginTop: '16px' }}>
                  <div className="card-body">
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%' }}
                      onClick={() => navigate('/comparison')}
                    >
                      <Check size={16} /> Compare {productQuotes.length} Quotes <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="disabled-overlay">
            <div className="disabled-content">
              <Package size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
              <h3>{t('landedCost.selectProductToContinue')}</h3>
              <p>Choose a product above to configure fees and preview landed costs.</p>
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}

export default LandedCost;
